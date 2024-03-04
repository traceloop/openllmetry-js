import * as lodash from "lodash";
import * as llamaindex from "llamaindex";
import { trace, context, Tracer, SpanStatusCode } from "@opentelemetry/api";
import { LlamaIndexInstrumentationConfig } from "./types";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
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
    return contextShouldSendPrompts;
  }

  return config.traceContent !== undefined ? config.traceContent : true;
};

export async function* generatorWrapper(
  streamingResult:
    | AsyncIterable<llamaindex.ChatResponseChunk>
    | AsyncIterable<llamaindex.CompletionResponse>,
  fn: (message: string) => void,
) {
  let message = "";
  for await (const messageChunk of streamingResult) {
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
  tracer: Tracer,
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return (original: Function) => {
    return function method(this: any, ...args: unknown[]) {
      const name = `${lodash.snakeCase(className)}.${lodash.snakeCase(methodName)}`;
      const span = tracer.startSpan(`${name}`);
      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, kind);

      if (kind === TraceloopSpanKindValues.WORKFLOW) {
        span.setAttribute(SpanAttributes.TRACELOOP_WORKFLOW_NAME, name);
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
