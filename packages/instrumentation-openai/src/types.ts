import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {}

export interface TraceloopManagedPromptAttributeObject {
  _traceloopManagedPromptAttributes?: TraceloopManagedPromptAttributes;
}
export interface TraceloopManagedPromptAttributes {
  key?: string;
  version?: number;
  name?: string;
  hash?: string;
  variables?: Record<string, string>;
}
