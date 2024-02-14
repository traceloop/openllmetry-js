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
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { ASSOCATION_PROPERTIES_KEY, WORKFLOW_NAME_KEY } from "./tracing";
import { Telemetry } from "../telemetry/telemetry";
import { TraceloopSampler } from "./sampler";
import { _configuration } from "../configuration";
import { AIInstrumentation } from "@traceloop/ai-semantic-conventions";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: unknown;
let azureOpenAIInstrumentation: unknown;
let llamaIndexInstrumentation: unknown;
let pineconeInstrumentation: unknown;
let vertexaiInstrumentation: unknown;
let aiplatformInstrumentation: unknown;
let langChainInstrumentation: unknown;
let bedrockInstrumentation: unknown;

const instrumentations: Instrumentation[] = [];

const hasModule = (module: string) => {
  try {
    require.resolve(module);
    return true;
  } catch (e) {
    return false;
  }
};

export const initInstrumentations = async () => {
  if (hasModule("openai")) {
    const { OpenAIInstrumentation } = await import(
      "@traceloop/instrumentation-openai"
    );
    openAIInstrumentation = new OpenAIInstrumentation();
    instrumentations.push(openAIInstrumentation as Instrumentation);
  }

  if (hasModule("@azure/openai")) {
    const { AzureOpenAIInstrumentation } = await import(
      "@traceloop/instrumentation-azure"
    );
    azureOpenAIInstrumentation = new AzureOpenAIInstrumentation();
    instrumentations.push(azureOpenAIInstrumentation as Instrumentation);
  }

  if (hasModule("llamaindex")) {
    const { LlamaIndexInstrumentation } = await import(
      "@traceloop/instrumentation-llamaindex"
    );
    llamaIndexInstrumentation = new LlamaIndexInstrumentation();
    instrumentations.push(llamaIndexInstrumentation as Instrumentation);
  }

  if (hasModule("@pinecone-database/pinecone")) {
    const { PineconeInstrumentation } = await import(
      "@traceloop/instrumentation-pinecone"
    );
    pineconeInstrumentation = new PineconeInstrumentation();
    instrumentations.push(pineconeInstrumentation as Instrumentation);
  }

  if (hasModule("@google-cloud/vertexai")) {
    const { VertexAIInstrumentation } = await import(
      "@traceloop/instrumentation-vertexai"
    );
    vertexaiInstrumentation = new VertexAIInstrumentation();
    instrumentations.push(vertexaiInstrumentation as Instrumentation);
  }

  if (hasModule("@google-cloud/aiplatform")) {
    const { AIPlatformInstrumentation } = await import(
      "@traceloop/instrumentation-vertexai"
    );
    aiplatformInstrumentation = new AIPlatformInstrumentation();
    instrumentations.push(aiplatformInstrumentation as Instrumentation);
  }

  if (hasModule("langchain")) {
    const { LangChainInstrumentation } = await import(
      "@traceloop/instrumentation-langchain"
    );
    langChainInstrumentation = new LangChainInstrumentation();
    instrumentations.push(langChainInstrumentation as Instrumentation);
  }

  if (hasModule("@aws-sdk/client-bedrock-runtime")) {
    const { BedrockInstrumentation } = await import(
      "@traceloop/instrumentation-bedrock"
    );
    bedrockInstrumentation = new BedrockInstrumentation();
    instrumentations.push(bedrockInstrumentation as Instrumentation);
  }
};

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const startTracing = (options: InitializeOptions) => {
  if (!shouldSendTraces()) {
    (openAIInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
    (azureOpenAIInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
    (llamaIndexInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
    (vertexaiInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
    (aiplatformInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
    (bedrockInstrumentation as AIInstrumentation).setConfig({
      traceContent: false,
    });
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

  if (options.instrumentModules?.openAI) {
    (openAIInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.openAI,
    );
  }
  if (options.instrumentModules?.llamaIndex) {
    (llamaIndexInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.llamaIndex,
    );
  }
  if (options.instrumentModules?.pinecone) {
    (pineconeInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.pinecone,
    );
  }
  if (options.instrumentModules?.google_vertexai) {
    (vertexaiInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.google_vertexai,
    );
  }

  if (options.instrumentModules?.google_aiplatform) {
    (aiplatformInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.google_aiplatform,
    );
  }

  if (options.instrumentModules?.bedrock) {
    (bedrockInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.bedrock,
    );
  }
};

export const shouldSendTraces = () => {
  if (!_configuration) {
    console.log("Warning: Traceloop not initialized");
    return false;
  }

  if (
    _configuration.traceContent === false ||
    (process.env.TRACELOOP_TRACE_CONTENT || "true").toLowerCase() === "false"
  ) {
    return false;
  }

  return true;
};

export const forceFlush = async () => {
  await _spanProcessor.forceFlush();
};
