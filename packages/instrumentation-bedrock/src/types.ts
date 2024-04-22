import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface BedrockInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to log prompts, completions and embeddings on traces.
   * @default true
   */
  traceContent?: boolean;

  /**
   * A custom logger to log any exceptions that happen during span creation.
   */
  exceptionLogger?: (e: Error) => void;
}
