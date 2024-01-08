import * as lodash from "lodash";
import { trace, context, Tracer, SpanStatusCode } from "@opentelemetry/api";
import { LlamaIndexInstrumentationConfig } from "./types";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
import {
  TraceloopSpanKindValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

export const shouldSendPrompts = (config: LlamaIndexInstrumentationConfig) => {
  return config.traceContent !== undefined ? config.traceContent : true;
};

export function genericWrapper(methodName: string, tracer: Tracer) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return (original: Function) => {
    return function method(this: any, ...args: unknown[]) {
      const span = tracer.startSpan(`${lodash.snakeCase(methodName)}.task`);
      span.setAttribute(
        SpanAttributes.TRACELOOP_SPAN_KIND,
        TraceloopSpanKindValues.TASK,
      );
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
