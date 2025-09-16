import { trace, createContextKey, Context } from "@opentelemetry/api";

const TRACER_NAME = "@traceloop/node-server-sdk";
export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");
export const ENTITY_NAME_KEY = createContextKey("entity_name");
export const ASSOCATION_PROPERTIES_KEY = createContextKey(
  "association_properties",
);

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};

export const getTraceloopTracer = getTracer;

export const getEntityPath = (entityContext: Context): string | undefined => {
  const path = entityContext.getValue(ENTITY_NAME_KEY);

  return path ? `${path}` : undefined;
};
