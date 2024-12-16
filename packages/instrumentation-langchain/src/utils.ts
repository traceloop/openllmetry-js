import { trace, context, Tracer, SpanStatusCode } from "@opentelemetry/api";
import { safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
import {
  TraceloopSpanKindValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

export function genericWrapper(
  tracer: () => Tracer,
  shouldSendPrompts: boolean,
  spanKind: TraceloopSpanKindValues,
  spanName?: string,
) {
  // eslint-disable-next-line
  return (original: Function) => {
    return function method(this: any, ...args: unknown[]) {
      const span = tracer().startSpan(
        spanName || `${this.constructor.name}.${spanKind}`,
      );
      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, spanKind);

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
        } catch (e) {
          this._diag.debug(e);
          this._config.exceptionLogger?.(e);
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
            } catch (e) {
              this._diag.debug(e);
              this._config.exceptionLogger?.(e);
            } finally {
              span.end();
              resolve(result);
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

export function taskWrapper(
  tracer: () => Tracer,
  shouldSendPrompts: boolean,
  spanName?: string,
) {
  return genericWrapper(
    tracer,
    shouldSendPrompts,
    TraceloopSpanKindValues.TASK,
    spanName,
  );
}

export function workflowWrapper(
  tracer: () => Tracer,
  shouldSendPrompts: boolean,
  spanName: string,
) {
  return genericWrapper(
    tracer,
    shouldSendPrompts,
    TraceloopSpanKindValues.WORKFLOW,
    spanName,
  );
}
