import { InitializeOptions } from "../interfaces";
import { validateConfiguration } from "./validation";
import { startTracing } from "../tracing";

export let _configuration: InitializeOptions;

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const initialize = async (options: InitializeOptions) => {
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

  validateConfiguration(options);

  _configuration = Object.freeze(options);

  if (!options.suppressLogs) {
    console.log(
      `Traceloop exporting traces to ${
        _configuration.exporter ? "a custom exporter" : _configuration.baseUrl
      }`,
    );
  }

  startTracing(_configuration);
};
