import { trace, createContextKey, Context } from "@opentelemetry/api";
import { version } from "../../../package.json";

const TRACER_NAME = "@traceloop/node-server-sdk";
const TRACER_VERSION = version;

export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");
export const ENTITY_NAME_KEY = createContextKey("entity_name");
export const AGENT_NAME_KEY = createContextKey("agent_name");
export const CONVERSATION_ID_KEY = createContextKey("conversation_id");
export const ASSOCATION_PROPERTIES_KEY = createContextKey(
  "association_properties",
);

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
};

export const getTraceloopTracer = getTracer;

export const getEntityPath = (entityContext: Context): string | undefined => {
  const path = entityContext.getValue(ENTITY_NAME_KEY);

  return path ? `${path}` : undefined;
};
