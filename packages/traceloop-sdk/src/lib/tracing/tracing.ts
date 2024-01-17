import { trace, createContextKey } from "@opentelemetry/api";
import {
  SpanAttributes,
  TraceloopCustomProcessingStepTypeValues,
} from "@traceloop/ai-semantic-conventions";
const TRACER_NAME = "traceloop.tracer";
export const WORKFLOW_NAME_KEY = createContextKey("workflow_name");
export const ASSOCATION_PROPERTIES_KEY = createContextKey(
  "association_properties",
);

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};

export const reportCustomProcessing = (
  kind: TraceloopCustomProcessingStepTypeValues,
  input: string,
  output: string,
) => {
  const s = getTracer().startSpan(`custom.${kind}`, {
    attributes: {
      [SpanAttributes.TRACELOOP_CUSTOM_PROCESSING_STEP_TYPE]: kind,
      [SpanAttributes.TRACELOOP_CUSTOM_PROCESSING_INPUT]: input,
      [SpanAttributes.TRACELOOP_CUSTOM_PROCESSING_OUTPUT]: output,
    },
  });
  s.end();
};
