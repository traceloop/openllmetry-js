import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface VertexAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;
}

export interface AIPlatformInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;
}
