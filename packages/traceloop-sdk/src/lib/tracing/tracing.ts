import { trace, createContextKey } from "@opentelemetry/api";

const TRACER_NAME = "traceloop.tracer";
export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};
