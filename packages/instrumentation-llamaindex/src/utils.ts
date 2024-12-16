import * as lodash from "lodash";
import type * as llamaindex from "llamaindex";
import { trace, context, Tracer, SpanStatusCode } from "@opentelemetry/api";
import { LlamaIndexInstrumentationConfig } from "./types";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
import { Context } from "@opentelemetry/api";
import {
  TraceloopSpanKindValues,
  SpanAttributes,
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
} from "@traceloop/ai-semantic-conventions";

export const shouldSendPrompts = (config: LlamaIndexInstrumentationConfig) => {
  const contextShouldSendPrompts = context
    .active()
    .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

  if (contextShouldSendPrompts !== undefined) {
    return !!contextShouldSendPrompts;
  }

  return config.traceContent !== undefined ? config.traceContent : true;
};

// Adopted from https://github.com/open-telemetry/opentelemetry-js/issues/2951#issuecomment-1214587378
export function bindAsyncGenerator<T = unknown, TReturn = any, TNext = unknown>(
  ctx: Context,
  generator: AsyncGenerator<T, TReturn, TNext>,
): AsyncGenerator<T, TReturn, TNext> {
  return {
    next: context.bind(ctx, generator.next.bind(generator)),
    return: context.bind(ctx, generator.return.bind(generator)),
    throw: context.bind(ctx, generator.throw.bind(generator)),

    [Symbol.asyncIterator]() {
      return bindAsyncGenerator(ctx, generator[Symbol.asyncIterator]());
    },
  };
}

export async function* generatorWrapper(
  streamingResult: AsyncGenerator,
  ctx: Context,
  fn: () => void,
) {
  for await (const chunk of bindAsyncGenerator(ctx, streamingResult)) {
    yield chunk;
  }
  fn();
}

export async function* llmGeneratorWrapper(
  streamingResult:
    | AsyncIterable<llamaindex.ChatResponseChunk>
    | AsyncIterable<llamaindex.CompletionResponse>,
  ctx: Context,
  fn: (message: string) => void,
) {
  let message = "";

  for await (const messageChunk of bindAsyncGenerator(
    ctx,
    streamingResult as AsyncGenerator,
  )) {
    if ((messageChunk as llamaindex.ChatResponseChunk).delta) {
      message += (messageChunk as llamaindex.ChatResponseChunk).delta;
    }
    if ((messageChunk as llamaindex.CompletionResponse).text) {
      message += (messageChunk as llamaindex.CompletionResponse).text;
    }
    yield messageChunk;
  }
  fn(message);
}

export function genericWrapper(
  className: string,
  methodName: string,
  kind: TraceloopSpanKindValues,
  tracer: () => Tracer,
  shouldSendPrompts: boolean,
) {
  // eslint-disable-next-line
  return (original: Function) => {
    return function method(this: any, ...args: unknown[]) {
      const params = args[0];
      const streaming = params && (params as any).stream;

      const name = `${lodash.snakeCase(className)}.${lodash.snakeCase(methodName)}`;
      const span = tracer().startSpan(`${name}`, {}, context.active());
      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, kind);

      if (kind === TraceloopSpanKindValues.WORKFLOW) {
        span.setAttribute(SpanAttributes.TRACELOOP_WORKFLOW_NAME, name);
      }

      if (shouldSendPrompts) {
        try {
          if (
            args.length === 1 &&
            typeof args[0] === "object" &&
            !(args[0] instanceof Map)
          ) {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_INPUT,
              JSON.stringify({ args: [], kwargs: args[0] }),
            );
          } else {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_INPUT,
              JSON.stringify({
                args: args.map((arg) =>
                  arg instanceof Map ? Array.from(arg.entries()) : arg,
                ),
                kwargs: {},
              }),
            );
          }
        } catch {
          /* empty */
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
              result = generatorWrapper(result, execContext, () => {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
              });
              resolve(result);
            } else {
              span.setStatus({ code: SpanStatusCode.OK });

              try {
                if (shouldSendPrompts) {
                  if (result instanceof Map) {
                    span.setAttribute(
                      SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                      JSON.stringify(Array.from(result.entries())),
                    );
                  } else {
                    span.setAttribute(
                      SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                      JSON.stringify(result),
                    );
                  }
                }
              } finally {
                span.end();
                resolve(result);
              }
            }
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
