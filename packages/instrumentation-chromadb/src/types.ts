import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface ChromaDBInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;
}
