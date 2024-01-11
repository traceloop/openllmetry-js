import * as lodash from "lodash";
import type * as llamaindex from "llamaindex";

import {
  Tracer,
  Span,
  SpanStatusCode,
  trace,
  context,
} from "@opentelemetry/api";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";

import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { LlamaIndexInstrumentationConfig } from "./types";
import { shouldSendPrompts, generatorWrapper } from "./utils";

type LLM = llamaindex.LLM;

export class CustomLLMInstrumentation {
  private config: LlamaIndexInstrumentationConfig;
  private tracer: Tracer;

  constructor(config: LlamaIndexInstrumentationConfig, tracer: Tracer) {
    this.config = config;
    this.tracer = tracer;
  }

  completionWrapper({ className }: { className: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: LLM["complete"]) => {
      return function method(
        this: LLM,
        ...args: Parameters<LLM["complete"]>
      ): ReturnType<LLM["complete"]> {
        const prompt = args[0];
        const streaming = args[2];

        const span = plugin.tracer.startSpan(
          `${lodash.snakeCase(className)}.completion`,
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, className);
        span.setAttribute(
          SpanAttributes.LLM_REQUEST_MODEL,
          this.metadata.model,
        );
        span.setAttribute(
          SpanAttributes.LLM_REQUEST_TYPE,
          SpanAttributes.LLM_COMPLETIONS,
        );
        span.setAttribute(SpanAttributes.LLM_TOP_P, this.metadata.topP);
        if (shouldSendPrompts(plugin.config)) {
          span.setAttribute(
            `${SpanAttributes.LLM_PROMPTS}.0.content`,
            prompt as string,
          );
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
              result = plugin.handleResponse(
                result,
                span,
                this.metadata,
                streaming,
              );
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

  chatWrapper({ className }: { className: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: LLM["chat"]) => {
      return function method(this: LLM, ...args: Parameters<LLM["chat"]>) {
        const messages = args[0];
        const streaming = args[2];

        const span = plugin.tracer.startSpan(
          `${lodash.snakeCase(className)}.chat`,
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
              result = plugin.handleResponse(
                result,
                span,
                this.metadata,
                streaming,
              );
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

  handleResponse(
    result: any,
    span: Span,
    metadata: llamaindex.LLMMetadata,
    streaming: boolean | undefined,
  ) {
    span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, metadata.model);
    if (!shouldSendPrompts(this.config)) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    }

    // Handle streming response of type `AsyncGenerator<string, void, unknown>`
    if (streaming) {
      result = generatorWrapper(result, (message) => {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
          message,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      });

      return result;
    }

    // Handle response of type `ChatMessage`
    span.setAttribute(
      `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
      result.message.role,
    );
    span.setAttribute(
      `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
      result.message.content,
    );
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    return result;
  }
}
