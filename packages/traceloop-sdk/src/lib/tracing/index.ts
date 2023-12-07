import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { Span, context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { Instrumentation } from "@opentelemetry/instrumentation";
import { InitializeOptions } from "../interfaces";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { ASSOCATION_PROPERTIES_KEY, WORKFLOW_NAME_KEY } from "./tracing";
import { Telemetry } from "../telemetry/telemetry";
import { TraceloopSampler } from "./sampler";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: OpenAIInstrumentation;
const instrumentations: Instrumentation[] = [];

export const initInstrumentations = () => {
  openAIInstrumentation = new OpenAIInstrumentation();
  instrumentations.push(openAIInstrumentation);
};

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const startTracing = (options: InitializeOptions) => {
  if (
    options.traceContent === false ||
    (process.env.TRACELOOP_TRACE_CONTENT || "true").toLowerCase() === "false"
  ) {
    openAIInstrumentation.setConfig({ traceContent: false });
  }

  const traceExporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: `${options.baseUrl}/v1/traces`,
      headers: { Authorization: `Bearer ${options.apiKey}` },
    });
  _spanProcessor = options.disableBatch
    ? new SimpleSpanProcessor(traceExporter)
    : new BatchSpanProcessor(traceExporter);

  _spanProcessor.onStart = (span: Span) => {
    const workflowName = context.active().getValue(WORKFLOW_NAME_KEY);
    if (workflowName) {
      span.setAttribute(
        SpanAttributes.TRACELOOP_WORKFLOW_NAME,
        workflowName as string,
      );
    }

    const associationProperties = context
      .active()
      .getValue(ASSOCATION_PROPERTIES_KEY);
    if (associationProperties) {
      for (const [key, value] of Object.entries(associationProperties)) {
        span.setAttribute(
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.${key}`,
          value,
        );
      }
    }
  };

  if (options.exporter) {
    Telemetry.getInstance().capture("tracer:init", {
      exporter: "custom",
      processor: options.disableBatch ? "simple" : "batch",
    });
  } else {
    Telemetry.getInstance().capture("tracer:init", {
      exporter: options.baseUrl ?? "",
      processor: options.disableBatch ? "simple" : "batch",
    });
  }

  _sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.appName,
    }),
    spanProcessor: _spanProcessor,
    traceExporter,
    instrumentations,
    sampler: new TraceloopSampler(),
  });

  _sdk.start();

  if (options.instrumentModules) {
    openAIInstrumentation.manuallyInstrument(options.instrumentModules.openAI);
  }
};

export const forceFlush = async () => {
  await _spanProcessor.forceFlush();
};
