import { InitializeOptions } from "../interfaces";
import { validateConfiguration } from "./validation";
import { startTracing } from "../tracing";
import { initializeRegistry } from "../prompts/registry";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

export let _configuration: InitializeOptions | undefined;

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const initialize = (options: InitializeOptions) => {
  if (_configuration) {
    return;
  }

  if (!options.baseUrl) {
    options.baseUrl =
      process.env.TRACELOOP_BASE_URL || "https://api.traceloop.com";
  }
  if (!options.apiKey) {
    options.apiKey = process.env.TRACELOOP_API_KEY;
  }
  if (!options.appName) {
    options.appName = process.env.npm_package_name;
  }

  if (options.traceloopSyncEnabled === undefined) {
    if (process.env.TRACELOOP_SYNC_ENABLED !== undefined) {
      options.traceloopSyncEnabled = ["1", "true"].includes(
        process.env.TRACELOOP_SYNC_ENABLED.toLowerCase(),
      );
    } else {
      options.traceloopSyncEnabled = true;
    }
  }

  if (options.traceloopSyncEnabled) {
    if (!options.traceloopSyncMaxRetries) {
      options.traceloopSyncMaxRetries =
        Number(process.env.TRACELOOP_SYNC_MAX_RETRIES) || 3;
    }

    if (!options.traceloopSyncPollingInterval) {
      options.traceloopSyncPollingInterval =
        Number(process.env.TRACELOOP_SYNC_POLLING_INTERVAL) || 60;
    }

    if (!options.traceloopSyncDevPollingInterval) {
      options.traceloopSyncDevPollingInterval =
        Number(process.env.TRACELOOP_SYNC_DEV_POLLING_INTERVAL) || 5;
    }
  }

  validateConfiguration(options);

  _configuration = Object.freeze(options);

  if (options.logLevel) {
    diag.setLogger(
      new DiagConsoleLogger(),
      logLevelToOtelLogLevel(options.logLevel),
    );
  }

  if (!options.silenceInitializationMessage) {
    console.log(
      `Traceloop exporting traces to ${
        _configuration.exporter ? "a custom exporter" : _configuration.baseUrl
      }`,
    );
  }

  startTracing(_configuration);
  initializeRegistry(_configuration);
};

const logLevelToOtelLogLevel = (
  logLevel: "debug" | "info" | "warn" | "error",
) => {
  switch (logLevel) {
    case "debug":
      return DiagLogLevel.DEBUG;
    case "info":
      return DiagLogLevel.INFO;
    case "warn":
      return DiagLogLevel.WARN;
    case "error":
      return DiagLogLevel.ERROR;
  }
};
