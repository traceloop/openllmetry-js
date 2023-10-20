import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { INSTRUMENTATIONS } from "../node-server-sdk";
import { InitializeOptions } from "../interfaces";
import { validateConfiguration } from "./validation";

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

  // const traceExporter = new ConsoleSpanExporter();
  const traceExporter = new OTLPTraceExporter({
    url: `${_configuration.baseUrl}/v1/traces`,
    headers: { Authorization: `Bearer ${_configuration.apiKey}` },
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: _configuration.appName,
    }),
    spanProcessor: _configuration.disableBatch
      ? new SimpleSpanProcessor(traceExporter)
      : new BatchSpanProcessor(traceExporter),
    traceExporter,
    instrumentations: INSTRUMENTATIONS,
  });

  sdk.start();
};
