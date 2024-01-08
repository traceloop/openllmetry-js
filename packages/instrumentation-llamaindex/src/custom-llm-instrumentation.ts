import * as lodash from "lodash";
import type * as llamaindex from "llamaindex";

import { Tracer, SpanStatusCode, trace, context } from "@opentelemetry/api";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";

import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { LlamaIndexInstrumentationConfig } from "./types";
import { shouldSendPrompts } from "./utils";

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
    return (original: Function) => {
      return function method(this: llamaindex.LLM, ...args: unknown[]) {
        const prompt = args[0];

        const span = plugin.tracer.startSpan(
          `${lodash.snakeCase(className)}.complete`,
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, "llamaindex");
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
          (error) => {},
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              span.setAttribute(
                SpanAttributes.LLM_RESPONSE_MODEL,
                this.metadata.model,
              );
              if (shouldSendPrompts(plugin.config)) {
                span.setAttribute(
                  `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
                  result.message.role,
                );
                span.setAttribute(
                  `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
                  result.message.content,
                );
              }
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
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
    return (original: Function) => {
      return function method(this: llamaindex.LLM, ...args: unknown[]) {
        const messages = args[0] as llamaindex.ChatMessage[];

        const span = plugin.tracer.startSpan(
          `${lodash.snakeCase(className)}.chat`,
        );

        span.setAttribute(SpanAttributes.LLM_VENDOR, "llamaindex");
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
          (error) => {},
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              span.setAttribute(
                SpanAttributes.LLM_RESPONSE_MODEL,
                this.metadata.model,
              );
              if (shouldSendPrompts(plugin.config)) {
                span.setAttribute(
                  `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
                  result.message.role,
                );
                span.setAttribute(
                  `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
                  result.message.content,
                );
              }
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
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
}
