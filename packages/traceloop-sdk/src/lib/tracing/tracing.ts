import { trace, createContextKey } from "@opentelemetry/api";

const TRACER_NAME = "traceloop.tracer";
export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");
export const ASSOCATION_PROPERTIES_KEY = createContextKey(
  "association_properties",
);

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};
