import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface GenAIInstrumentationConfig extends InstrumentationConfig {
  traceContent?: boolean;
  exceptionLogger?: (e: Error) => void;
}
