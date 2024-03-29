import { Span, context } from "@opentelemetry/api";
import { getTracer, WORKFLOW_NAME_KEY } from "./tracing";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";
import { withAssociationProperties } from "./association";
import { shouldSendTraces } from ".";

export type DecoratorConfig = {
  name: string;
  associationProperties?: { [name: string]: string };
  traceContent?: boolean;
  inputParameters?: unknown[];
};

function withEntity<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  type: TraceloopSpanKindValues,
  {
    name,
    associationProperties,
    traceContent: overrideTraceContent,
    inputParameters,
  }: DecoratorConfig,
  fn: F,
  thisArg?: ThisParameterType<F>,
  ...args: A
) {
  let entityContext = context.active();
  if (
    type === TraceloopSpanKindValues.WORKFLOW ||
    type === TraceloopSpanKindValues.AGENT
  ) {
    entityContext = entityContext.setValue(WORKFLOW_NAME_KEY, name);
  }
  if (overrideTraceContent != undefined) {
    entityContext = entityContext.setValue(
      CONTEXT_KEY_ALLOW_TRACE_CONTENT,
      overrideTraceContent,
    );
  }

  return withAssociationProperties(associationProperties ?? {}, () =>
    getTracer().startActiveSpan(
      `${name}.${type}`,
      {},
      entityContext,
      async (span: Span) => {
        if (
          type === TraceloopSpanKindValues.WORKFLOW ||
          type === TraceloopSpanKindValues.AGENT
        ) {
          span.setAttribute(SpanAttributes.TRACELOOP_WORKFLOW_NAME, name);
        }
        span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, type);
        span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, name);

        if (shouldSendTraces()) {
          try {
            const input = inputParameters ?? args;
            if (
              input.length === 1 &&
              typeof input[0] === "object" &&
              !(input[0] instanceof Map)
            ) {
              span.setAttribute(
                SpanAttributes.TRACELOOP_ENTITY_INPUT,
                JSON.stringify({ args: [], kwargs: input[0] }),
              );
            } else {
              span.setAttribute(
                SpanAttributes.TRACELOOP_ENTITY_INPUT,
                JSON.stringify({
                  args: input.map((arg) =>
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

        const res = fn.apply(thisArg, args);
        if (res instanceof Promise) {
          return res.then((resolvedRes) => {
            try {
              if (shouldSendTraces()) {
                if (resolvedRes instanceof Map) {
                  span.setAttribute(
                    SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                    JSON.stringify(Array.from(resolvedRes.entries())),
                  );
                } else {
                  span.setAttribute(
                    SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                    JSON.stringify(resolvedRes),
                  );
                }
              }
              return resolvedRes;
            } finally {
              span.end();
            }
          });
        }
        try {
          if (shouldSendTraces()) {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
              JSON.stringify(res),
            );
          }
          return res;
        } finally {
          span.end();
        }
      },
    ),
  );
}

export function withWorkflow<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.WORKFLOW,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withTask<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TASK,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withAgent<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.AGENT,
    config,
    fn,
    undefined,
    ...args,
  );
}

export function withTool<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(config: DecoratorConfig, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TOOL,
    config,
    fn,
    undefined,
    ...args,
  );
}

function entity(
  type: TraceloopSpanKindValues,
  config: Partial<DecoratorConfig>,
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod: () => any = descriptor.value;
    const entityName = config.name ?? originalMethod.name;

    if (originalMethod.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args: any[]) {
        return await withEntity(
          type,
          { ...config, name: entityName },
          originalMethod,
          target,
          ...args,
        );
      };
    } else {
      descriptor.value = function (...args: any[]) {
        return withEntity(
          type,
          { ...config, name: entityName },
          originalMethod,
          target,
          ...args,
        );
      };
    }
  };
}

export function workflow(config?: Partial<DecoratorConfig>) {
  return entity(TraceloopSpanKindValues.WORKFLOW, config ?? {});
}

export function task(config?: Partial<DecoratorConfig>) {
  return entity(TraceloopSpanKindValues.TASK, config ?? {});
}

export function agent(config?: Partial<DecoratorConfig>) {
  return entity(TraceloopSpanKindValues.AGENT, config ?? {});
}

export function tool(config?: Partial<DecoratorConfig>) {
  return entity(TraceloopSpanKindValues.TOOL, config ?? {});
}
