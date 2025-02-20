import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface TogetherAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;

  /**
   * Whether to enrich token information if missing from the trace.
   * @default false
   */
  enrichTokens?: boolean;

  /**
   * A custom logger to log any exceptions that happen during span creation.
   */
  exceptionLogger?: (e: Error) => void;
}
