import { trace, createContextKey } from "@opentelemetry/api";
import { Context } from "@opentelemetry/api/build/src/context/types";

const TRACER_NAME = "traceloop.tracer";
export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");
export const ENTITY_NAME_KEY = createContextKey("entity_name");
export const ASSOCATION_PROPERTIES_KEY = createContextKey(
  "association_properties",
);

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};

export const getChainedEntityName = (
  entityContext: Context,
  entityName: string,
): string => {
  const parentEntityName = entityContext.getValue(ENTITY_NAME_KEY);

  return parentEntityName ? `${parentEntityName}.${entityName}` : entityName;
};
