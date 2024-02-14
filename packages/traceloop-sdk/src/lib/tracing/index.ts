/* eslint-disable @typescript-eslint/no-var-requires */
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
import { ASSOCATION_PROPERTIES_KEY, WORKFLOW_NAME_KEY } from "./tracing";
import { Telemetry } from "../telemetry/telemetry";
import { TraceloopSampler } from "./sampler";
import { _configuration } from "../configuration";
import {
  AIInstrumentation,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: AIInstrumentation | undefined;
let azureOpenAIInstrumentation: AIInstrumentation | undefined;
let llamaIndexInstrumentation: AIInstrumentation | undefined;
let pineconeInstrumentation: AIInstrumentation | undefined;
let vertexaiInstrumentation: AIInstrumentation | undefined;
let aiplatformInstrumentation: AIInstrumentation | undefined;
let bedrockInstrumentation: AIInstrumentation | undefined;
let cohereInstrumentation: AIInstrumentation | undefined;

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
    const {
      OpenAIInstrumentation,
    } = require("@traceloop/instrumentation-openai");
    const instrumentation = new OpenAIInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    openAIInstrumentation = instrumentation;
  }

  if (hasModule("@azure/openai")) {
    const {
      AzureOpenAIInstrumentation,
    } = require("@traceloop/instrumentation-azure");
    const instrumentation = new AzureOpenAIInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    azureOpenAIInstrumentation = instrumentation;
  }

  if (hasModule("llamaindex")) {
    const {
      LlamaIndexInstrumentation,
    } = require("@traceloop/instrumentation-llamaindex");
    const instrumentation = new LlamaIndexInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    llamaIndexInstrumentation = instrumentation;
  }

  if (hasModule("@pinecone-database/pinecone")) {
    const {
      PineconeInstrumentation,
    } = require("@traceloop/instrumentation-pinecone");
    const instrumentation = new PineconeInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    pineconeInstrumentation = instrumentation;
  }

  if (hasModule("@google-cloud/vertexai")) {
    const {
      VertexAIInstrumentation,
    } = require("@traceloop/instrumentation-vertexai");
    const instrumentation = new VertexAIInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    vertexaiInstrumentation = instrumentation;
  }

  if (hasModule("@google-cloud/aiplatform")) {
    const {
      AIPlatformInstrumentation,
    } = require("@traceloop/instrumentation-vertexai");
    const instrumentation = new AIPlatformInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    aiplatformInstrumentation = instrumentation;
  }

  if (hasModule("langchain")) {
    const {
      LangChainInstrumentation,
    } = require("@traceloop/instrumentation-langchain");
    const instrumentation = new LangChainInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
  }

  if (hasModule("@aws-sdk/client-bedrock-runtime")) {
    const {
      BedrockInstrumentation,
    } = require("@traceloop/instrumentation-bedrock");
    const instrumentation = new BedrockInstrumentation();
    instrumentations.push(instrumentation as unknown as Instrumentation);
    bedrockInstrumentation = instrumentation;
  }

  if (hasModule("cohere-ai")) {
    const {
      CohereInstrumentation,
    } = require("@traceloop/instrumentation-cohere");
    const instrumentation = new CohereInstrumentation();
    instrumentations.push(cohereInstrumentation as unknown as Instrumentation);
    cohereInstrumentation = instrumentation;
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
    openAIInstrumentation?.setConfig({
      traceContent: false,
    });
    azureOpenAIInstrumentation?.setConfig({
      traceContent: false,
    });
    llamaIndexInstrumentation?.setConfig({
      traceContent: false,
    });
    vertexaiInstrumentation?.setConfig({
      traceContent: false,
    });
    aiplatformInstrumentation?.setConfig({
      traceContent: false,
    });
    bedrockInstrumentation?.setConfig({
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

  if (options.instrumentModules?.cohere) {
    (cohereInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.cohere,
    );
  }

  if (options.instrumentModules?.azureOpenAI) {
    (azureOpenAIInstrumentation as AIInstrumentation).manuallyInstrument(
      options.instrumentModules.azureOpenAI,
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
