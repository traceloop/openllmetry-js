import { Span, context } from "@opentelemetry/api";
import { getTracer, WORKFLOW_NAME_KEY } from "./tracing";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";

function withEntity<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  type: TraceloopSpanKindValues,
  name: string,
  fn: F,
  thisArg?: ThisParameterType<F>,
  ...args: A
) {
  const workflowContext =
    type === TraceloopSpanKindValues.WORKFLOW ||
    type === TraceloopSpanKindValues.AGENT
      ? context.active().setValue(WORKFLOW_NAME_KEY, name)
      : context.active();

  if (fn.constructor.name === "AsyncFunction") {
    return getTracer().startActiveSpan(
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
        const res = await fn.apply(thisArg, args);
        span.end();
        return res;
      },
    );
  }
  return getTracer().startActiveSpan(
    `${name}.${type}`,
    {},
    workflowContext,
    (span) => {
      span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, type);
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_NAME, name);
      const res = fn.apply(thisArg, args);
      span.end();
      return res;
    },
  );
}

export function withWorkflow<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, thisArg?: ThisParameterType<F>, ...args: A) {
  return withEntity(
    TraceloopSpanKindValues.WORKFLOW,
    name,
    fn,
    thisArg,
    ...args,
  );
}

export function withTask<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, thisArg?: ThisParameterType<F>, ...args: A) {
  return withEntity(TraceloopSpanKindValues.TASK, name, fn, thisArg, ...args);
}

export function withAgent<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, thisArg?: ThisParameterType<F>, ...args: A) {
  return withEntity(TraceloopSpanKindValues.AGENT, name, fn, thisArg, ...args);
}

export function withTool<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(name: string, fn: F, thisArg?: ThisParameterType<F>, ...args: A) {
  return withEntity(TraceloopSpanKindValues.TOOL, name, fn, thisArg, ...args);
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
          originalMethod,
          target,
          ...args,
        );
      };
    } else {
      descriptor.value = function (...args: any[]) {
        return withEntity(type, entityName, originalMethod, target, ...args);
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
