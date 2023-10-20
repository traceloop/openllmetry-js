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

  validateConfiguration(options);
  console.log(options.baseUrl);
  if (!options.baseUrl) {
    options.baseUrl = "https://api.traceloop.com";
  }
  _configuration = Object.freeze(options);

  startTracing(_configuration);
};
