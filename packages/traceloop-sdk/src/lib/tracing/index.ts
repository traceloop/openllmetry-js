import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { InitializeOptions } from "../interfaces";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";

let _sdk: NodeSDK;
let instrumentations: any[] = [];

export const initInstrumentations = () => {
  instrumentations.push(new OpenAIInstrumentation());
};

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const startTracing = (options: InitializeOptions) => {
  const traceExporter = new OTLPTraceExporter({
    url: `${options.baseUrl}/v1/traces`,
    headers: { Authorization: `Bearer ${options.apiKey}` },
  });

  _sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.appName,
    }),
    spanProcessor: options.disableBatch
      ? new SimpleSpanProcessor(traceExporter)
      : new BatchSpanProcessor(traceExporter),
    traceExporter,
    instrumentations,
  });

  _sdk.start();
};
