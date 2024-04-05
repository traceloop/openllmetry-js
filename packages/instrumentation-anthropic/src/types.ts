import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface AnthropicInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;
}
