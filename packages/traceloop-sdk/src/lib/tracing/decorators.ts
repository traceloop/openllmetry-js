import { Span, context } from "@opentelemetry/api";
import { getTracer, WORKFLOW_NAME_KEY } from "./tracing";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";
import { withAssociationProperties } from "./association";
import { shouldSendTraces } from ".";

function withEntity<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  type: TraceloopSpanKindValues,
  name: string,
  associationProperties: { [name: string]: string },
  fn: F,
  thisArg?: ThisParameterType<F>,
  ...args: A
) {
  const workflowContext =
    type === TraceloopSpanKindValues.WORKFLOW ||
    type === TraceloopSpanKindValues.AGENT
      ? context.active().setValue(WORKFLOW_NAME_KEY, name)
      : context.active();

  return withAssociationProperties(associationProperties, async () =>
    getTracer().startActiveSpan(
      `${name}.${type}`,
      {},
      workflowContext,
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
          if (args.length === 1 && typeof args[0] === "object") {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_INPUT,
              JSON.stringify({ args: [], kwargs: args[0] }),
            );
          } else {
            span.setAttribute(
              SpanAttributes.TRACELOOP_ENTITY_INPUT,
              JSON.stringify({ args, kwargs: {} }),
            );
          }
        }
        const res = fn.apply(thisArg, args);
        try {
          if (res instanceof Promise) {
            const result = await res;
            if (shouldSendTraces()) {
              span.setAttribute(
                SpanAttributes.TRACELOOP_ENTITY_OUTPUT,
                JSON.stringify(result),
              );
            }
            span.end();
            return result;
          }

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
>(
  name: string,
  associationProperties: { [name: string]: string },
  fn: F,
  ...args: A
) {
  return withEntity(
    TraceloopSpanKindValues.WORKFLOW,
    name,
    associationProperties,
    fn,
    undefined,
    ...args,
  );
}

export function withTask<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TASK,
    name,
    {},
    fn,
    undefined,
    ...args,
  );
}

export function withAgent<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  name: string,
  associationProperties: { [name: string]: string },
  fn: F,
  ...args: A
) {
  return withEntity(
    TraceloopSpanKindValues.AGENT,
    name,
    associationProperties,
    fn,
    undefined,
    ...args,
  );
}

export function withTool<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.TOOL,
    name,
    {},
    fn,
    undefined,
    ...args,
  );
}

function entity(type: TraceloopSpanKindValues, name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod: () => any = descriptor.value;
    const entityName = name ?? originalMethod.name;

    if (originalMethod.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args: any[]) {
        return await withEntity(
          type,
          entityName,
          {},
          originalMethod,
          target,
          ...args,
        );
      };
    } else {
      descriptor.value = function (...args: any[]) {
        return withEntity(
          type,
          entityName,
          {},
          originalMethod,
          target,
          ...args,
        );
      };
    }
  };
}

export function workflow(name?: string) {
  return entity(TraceloopSpanKindValues.WORKFLOW, name);
}

export function task(name?: string) {
  return entity(TraceloopSpanKindValues.TASK, name);
}

export function agent(name?: string) {
  return entity(TraceloopSpanKindValues.AGENT, name);
}

export function tool(name?: string) {
  return entity(TraceloopSpanKindValues.TOOL, name);
}
