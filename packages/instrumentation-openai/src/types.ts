import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export type ImageUploadCallback = (
  traceId: string,
  spanId: string,
  filename: string,
  base64Data: string
) => Promise<string>;

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
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

  /**
   * Callback function for uploading base64-encoded images.
   * Used for image generation and vision capabilities.
   * @default undefined
   */
  uploadBase64Image?: ImageUploadCallback;
}
