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
   * Explicitly specify modules to instrument. Optional.
   * This is a workaround specific to Next.js, see https://www.traceloop.com/docs/openllmetry/getting-started-nextjs
   */
  instrumentModules?: {
    openAI: typeof openai.OpenAI;
  };

  /**
   * Enables sync with Traceloop servers for the prompt registry functionality. Optional.
   * Defaults to TRACELOOP_SYNC_ENABLED environment variable or true if not set.
   */
  traceloopSyncEnabled?: boolean;

  /**
   * Defines the number of retires when fetching prompt data for the registry. Optional.
   * Defaults to TRACELOOP_SYNC_MAX_RETRIES environment variable or 3 if not set.
   */
  traceloopSyncMaxRetries?: number;

  /**
   * Defines the polling interval for the prompt registry. Optional.
   * Defaults to TRACELOOP_SYNC_POLLING_INTERVAL environment variable or 60 if not set.
   */
  traceloopSyncPollingInterval?: number;

  /**
   * Defines the polling interval for the prompt registry. Optional.
   * Defaults to TRACELOOP_SYNC_DEV_POLLING_INTERVAL environment variable or 5 if not set.
   */
  traceloopSyncDevPollingInterval?: number;
}
