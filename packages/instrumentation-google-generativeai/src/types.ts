/** Documents packages/instrumentation-google-generativeai/src/types.ts module purpose and public usage context */
import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface GenAIInstrumentationConfig extends InstrumentationConfig {
  traceContent?: boolean;
  exceptionLogger?: (e: Error) => void;
}
