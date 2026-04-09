import type * as llamaindex from "llamaindex";

import {
  Tracer,
  Span,
  Context,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
  DiagLogger,
} from "@opentelemetry/api";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";

import {
  SpanAttributes,
  FinishReasons,
} from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  formatInputMessages,
  formatOutputMessage,
  mapOpenAIContentBlock,
} from "@traceloop/instrumentation-utils";

import { LlamaIndexInstrumentationConfig } from "./types";
import { shouldSendPrompts, llmGeneratorWrapper } from "./utils";

type LLM = llamaindex.LLM;

type ResponseType = llamaindex.ChatResponse | llamaindex.CompletionResponse;
type AsyncResponseType =
  | AsyncIterable<llamaindex.ChatResponseChunk>
  | AsyncIterable<llamaindex.CompletionResponse>;

const classNameToProviderName: Record<string, string> = {
  OpenAI: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
};

export const openAIFinishReasonMap: Record<string, string> = {
  stop: FinishReasons.STOP,
  length: FinishReasons.LENGTH,
  tool_calls: FinishReasons.TOOL_CALL,
  content_filter: FinishReasons.CONTENT_FILTER,
  function_call: FinishReasons.TOOL_CALL,
};

export class CustomLLMInstrumentation {
  constructor(
    private config: () => LlamaIndexInstrumentationConfig,
    private diag: DiagLogger,
    private tracer: () => Tracer,
  ) {}

  chatWrapper({ className }: { className: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;

    return (original: LLM["chat"]) => {
      return function method(this: LLM, ...args: Parameters<LLM["chat"]>) {
        const params = args[0];
        const messages = params?.messages;
        const streaming = params?.stream;

        const span = plugin.tracer().startSpan(`chat ${this.metadata.model}`, {
          kind: SpanKind.CLIENT,
        });

        try {
          span.setAttribute(
            ATTR_GEN_AI_PROVIDER_NAME,
            classNameToProviderName[className] ?? className.toLowerCase(),
          );
          span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, this.metadata.model);
          span.setAttribute(
            ATTR_GEN_AI_OPERATION_NAME,
            GEN_AI_OPERATION_NAME_VALUE_CHAT,
          );
          span.setAttribute(ATTR_GEN_AI_REQUEST_TOP_P, this.metadata.topP);
          if (shouldSendPrompts(plugin.config()) && messages) {
            span.setAttribute(
              ATTR_GEN_AI_INPUT_MESSAGES,
              formatInputMessages(messages, mapOpenAIContentBlock),
            );
          }
        } catch (e) {
          plugin.diag.warn(e);
          plugin.config().exceptionLogger?.(e);
        }

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {},
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              if (streaming) {
                result = plugin.handleStreamingResponse(
                  result,
                  span,
                  execContext,
                  this.metadata,
                );
              } else {
                result = plugin.handleResponse(result, span, this.metadata);
              }
              resolve(result);
            });
          })
          .catch((error: Error) => {
            return new Promise((_, reject) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.end();
              reject(error);
            });
          });
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  handleResponse<T extends ResponseType>(
    result: T,
    span: Span,
    metadata: llamaindex.LLMMetadata,
  ): T {
    span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, metadata.model);

    try {
      const raw = (result as any).raw;
      const finishReason: string | null =
        raw?.choices?.[0]?.finish_reason ?? null;

      // finish_reasons: metadata, not content — always set outside shouldSendPrompts
      if (finishReason != null) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
          openAIFinishReasonMap[finishReason] ?? finishReason,
        ]);
      }

      // Token usage: always set when available
      const usage = raw?.usage;
      if (usage) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.prompt_tokens);
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          usage.completion_tokens,
        );
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
          usage.total_tokens,
        );
      }

      // output messages: content — always set inside shouldSendPrompts
      if (
        shouldSendPrompts(this.config()) &&
        (result as llamaindex.ChatResponse).message
      ) {
        const content = (result as llamaindex.ChatResponse).message.content;
        // Normalize to array so mapOpenAIContentBlock handles both string and block array
        const contentArray = typeof content === "string" ? [content] : content;
        span.setAttribute(
          ATTR_GEN_AI_OUTPUT_MESSAGES,
          formatOutputMessage(
            contentArray,
            finishReason,
            openAIFinishReasonMap,
            GEN_AI_OPERATION_NAME_VALUE_CHAT,
            mapOpenAIContentBlock,
          ),
        );
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (e) {
      this.diag.warn(e);
      this.config().exceptionLogger?.(e);
    }

    span.end();
    return result;
  }

  handleStreamingResponse<T extends AsyncResponseType>(
    result: T,
    span: Span,
    execContext: Context,
    metadata: llamaindex.LLMMetadata,
  ): T {
    span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, metadata.model);

    return llmGeneratorWrapper(result, execContext, (message, lastChunk) => {
      try {
        // Extract finish_reason and usage from the last chunk's raw OpenAI
        // response — available when stream_options: { include_usage: true }
        // is set on the LLM (OpenAI sends usage in the final streaming chunk).
        const lastRaw = lastChunk?.raw as any;
        const finishReason: string | null =
          lastRaw?.choices?.[0]?.finish_reason ?? null;
        const usage = lastRaw?.usage ?? null;

        if (finishReason != null) {
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
            openAIFinishReasonMap[finishReason] ?? finishReason,
          ]);
        }

        if (usage) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            usage.prompt_tokens,
          );
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            usage.completion_tokens,
          );
          span.setAttribute(
            SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
            usage.total_tokens,
          );
        }

        if (shouldSendPrompts(this.config())) {
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            formatOutputMessage(
              [message],
              finishReason,
              openAIFinishReasonMap,
              GEN_AI_OPERATION_NAME_VALUE_CHAT,
              mapOpenAIContentBlock,
            ),
          );
        }
      } catch (e) {
        this.diag.warn(e);
        this.config().exceptionLogger?.(e);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }) as any;
  }
}
