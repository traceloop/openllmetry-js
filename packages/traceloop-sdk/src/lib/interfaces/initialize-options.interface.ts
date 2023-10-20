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
   * The API Key for sending traces data. Required.
   */
  apiKey: string;

  /**
   * The OTLP endpoint for sending traces data. Optional.
   * Defaults to https://api.traceloop.com/
   */
  baseUrl?: string;

  /**
   * Sends traces and spans without batching, for local developement. Optional.
   * Defaults to false.
   */
  disableBatch?: boolean;
}
