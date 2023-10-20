import { Span, context } from "@opentelemetry/api";
import { getTracer, WORKFLOW_NAME_KEY } from "./tracing";
import {
  SemanticAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";

function entity(type: TraceloopSpanKindValues, name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod: Function = descriptor.value;
    const entityName = name ?? originalMethod.name;

    if (originalMethod.constructor.name === "AsyncFunction") {
      descriptor.value = async function (...args: any[]) {
        const workflowContext =
          type === TraceloopSpanKindValues.WORKFLOW
            ? context.active().setValue(WORKFLOW_NAME_KEY, entityName)
            : context.active();
        await getTracer().startActiveSpan(
          `${entityName}.${type}`,
          {},
          workflowContext,
          async (span: Span) => {
            span.setAttribute(
              SemanticAttributes.TRACELOOP_WORKFLOW_NAME,
              entityName,
            );
            span.setAttribute(SemanticAttributes.TRACELOOP_SPAN_KIND, type);
            span.setAttribute(
              SemanticAttributes.TRACELOOP_ENTITY_NAME,
              entityName,
            );
            const res = await originalMethod.apply(this, args);
            span.end();
            return res;
          },
        );
      };
    } else {
      descriptor.value = function (...args: any[]) {
        getTracer().startActiveSpan(`${entityName}.${type}`, (span: Span) => {
          span.setAttribute(SemanticAttributes.TRACELOOP_SPAN_KIND, type);
          span.setAttribute(
            SemanticAttributes.TRACELOOP_ENTITY_NAME,
            entityName,
          );
          const res = originalMethod.apply(this, args);
          span.end();
          return res;
        });
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
