import { SpanExporter } from "@opentelemetry/sdk-trace-base";
import * as openai from "openai";

/**
 * Options for initializing the Traceloop SDK.
 */
export interface InitializeOptions {
  /**
   * The app name to be used when reporting traces. Optional.
   * Defaults to the package name.
   */
  appName?: string;

  /**
   * The API Key for sending traces data. Optional.
   * Defaults to the TRACELOOP_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * The OTLP endpoint for sending traces data. Optional.
   * Defaults to TRACELOOP_BASE_URL environment variable or https://api.traceloop.com/
   */
  baseUrl?: string;

  /**
   * Sends traces and spans without batching, for local developement. Optional.
   * Defaults to false.
   */
  disableBatch?: boolean;

  /**
   * Suppress all log messages of Traceloop SDK. Optional.
   * Defaults to false.
   */
  suppressLogs?: boolean;

  /**
   * The OpenTelemetry SpanExporter to be used for sending traces data. Optional.
   * Defaults to the OTLP exporter.
   */
  exporter?: SpanExporter;

  /**
   * Explictly specify modules to instrument. Optional.
   * This is a workaround specific to Next.js, see https://www.traceloop.com/docs/openllmetry/getting-started-nextjs
   */
  instrumentModules?: {
    openai: typeof openai;
  };
}
