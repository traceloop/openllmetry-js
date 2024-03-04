import * as lodash from "lodash";
import type * as llamaindex from "llamaindex";

import {
  Tracer,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
} from "@opentelemetry/api";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";

import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { LlamaIndexInstrumentationConfig } from "./types";
import { shouldSendPrompts, generatorWrapper } from "./utils";

type LLM = llamaindex.LLM;

type ResponseType = llamaindex.ChatResponse | llamaindex.CompletionResponse;
type AsyncResponseType =
  | AsyncIterable<llamaindex.ChatResponseChunk>
  | AsyncIterable<llamaindex.CompletionResponse>;

export class CustomLLMInstrumentation {
  private config: LlamaIndexInstrumentationConfig;
  private tracer: Tracer;

  constructor(config: LlamaIndexInstrumentationConfig, tracer: Tracer) {
    this.config = config;
    this.tracer = tracer;
  }

  chatWrapper({ className }: { className: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: LLM["chat"]) => {
      return function method(this: LLM, ...args: Parameters<LLM["chat"]>) {
        const params = args[0];
        const messages = params?.messages;
        const streaming = params?.stream;

        const span = plugin.tracer.startSpan(
          `llamaindex.${lodash.snakeCase(className)}.chat`,
          { kind: SpanKind.CLIENT },
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, className);
        span.setAttribute(
          SpanAttributes.LLM_REQUEST_MODEL,
          this.metadata.model,
        );
        span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, "chat");
        span.setAttribute(SpanAttributes.LLM_TOP_P, this.metadata.topP);
        if (shouldSendPrompts(plugin.config)) {
          for (const messageIdx in messages) {
            span.setAttribute(
              `${SpanAttributes.LLM_PROMPTS}.${messageIdx}.content`,
              messages[messageIdx].content,
            );
            span.setAttribute(
              `${SpanAttributes.LLM_PROMPTS}.${messageIdx}.role`,
              messages[messageIdx].role,
            );
          }
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

    if ((result as llamaindex.ChatResponse).message) {
      span.setAttribute(
        `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
        (result as llamaindex.ChatResponse).message.role,
      );
      span.setAttribute(
        `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
        (result as llamaindex.ChatResponse).message.content,
      );
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
    return result;
  }

  handleStreamingResponse<T extends AsyncResponseType>(
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

    return generatorWrapper(result, (message) => {
      span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.content`, message);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }) as any;
  }
}
