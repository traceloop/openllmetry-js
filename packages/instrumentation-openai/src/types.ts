import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;
}
