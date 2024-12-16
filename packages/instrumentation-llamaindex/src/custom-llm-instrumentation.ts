import * as lodash from "lodash";
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

import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { LlamaIndexInstrumentationConfig } from "./types";
import { shouldSendPrompts, llmGeneratorWrapper } from "./utils";

type LLM = llamaindex.LLM;

type ResponseType = llamaindex.ChatResponse | llamaindex.CompletionResponse;
type AsyncResponseType =
  | AsyncIterable<llamaindex.ChatResponseChunk>
  | AsyncIterable<llamaindex.CompletionResponse>;

export class CustomLLMInstrumentation {
  constructor(
    private config: LlamaIndexInstrumentationConfig,
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

        const span = plugin
          .tracer()
          .startSpan(`llamaindex.${lodash.snakeCase(className)}.chat`, {
            kind: SpanKind.CLIENT,
          });

        try {
          span.setAttribute(SpanAttributes.LLM_SYSTEM, className);
          span.setAttribute(
            SpanAttributes.LLM_REQUEST_MODEL,
            this.metadata.model,
          );
          span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, "chat");
          span.setAttribute(
            SpanAttributes.LLM_REQUEST_TOP_P,
            this.metadata.topP,
          );
          if (shouldSendPrompts(plugin.config)) {
            for (const messageIdx in messages) {
              const content = messages[messageIdx].content;
              if (typeof content === "string") {
                span.setAttribute(
                  `${SpanAttributes.LLM_PROMPTS}.${messageIdx}.content`,
                  content as string,
                );
              } else if (
                (content as llamaindex.MessageContentDetail[])[0].type ===
                "text"
              ) {
                span.setAttribute(
                  `${SpanAttributes.LLM_PROMPTS}.${messageIdx}.content`,
                  (content as llamaindex.MessageContentTextDetail[])[0].text,
                );
              }

              span.setAttribute(
                `${SpanAttributes.LLM_PROMPTS}.${messageIdx}.role`,
                messages[messageIdx].role,
              );
            }
          }
        } catch (e) {
          plugin.diag.warn(e);
          plugin.config.exceptionLogger?.(e);
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
    span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, metadata.model);

    if (!shouldSendPrompts(this.config)) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    }

    try {
      if ((result as llamaindex.ChatResponse).message) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
          (result as llamaindex.ChatResponse).message.role,
        );
        const content = (result as llamaindex.ChatResponse).message.content;
        if (typeof content === "string") {
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
            content,
          );
        } else if (content[0].type === "text") {
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
            content[0].text,
          );
        }
        span.setStatus({ code: SpanStatusCode.OK });
      }
    } catch (e) {
      this.diag.warn(e);
      this.config.exceptionLogger?.(e);
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
    span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, metadata.model);
    if (!shouldSendPrompts(this.config)) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    }

    return llmGeneratorWrapper(result, execContext, (message) => {
      span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.content`, message);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }) as any;
  }
}
