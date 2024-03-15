/* eslint-disable @typescript-eslint/no-var-requires */
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { Span, context, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Instrumentation } from "@opentelemetry/instrumentation";
import { InitializeOptions } from "../interfaces";
import { ASSOCATION_PROPERTIES_KEY, WORKFLOW_NAME_KEY } from "./tracing";
import { Telemetry } from "../telemetry/telemetry";
import { _configuration } from "../configuration";
import {
  AIInstrumentation,
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: AIInstrumentation | undefined;
let azureOpenAIInstrumentation: AIInstrumentation | undefined;
let llamaIndexInstrumentation: AIInstrumentation | undefined;
let vertexaiInstrumentation: AIInstrumentation | undefined;
let aiplatformInstrumentation: AIInstrumentation | undefined;
let bedrockInstrumentation: AIInstrumentation | undefined;
let cohereInstrumentation: AIInstrumentation | undefined;

const instrumentations: Instrumentation[] = [];

export const initInstrumentations = () => {
  try {
    const {
      OpenAIInstrumentation,
    } = require("@traceloop/instrumentation-openai");
    const instrumentation = new OpenAIInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    openAIInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }
  try {
    const {
      AzureOpenAIInstrumentation,
    } = require("@traceloop/instrumentation-azure");
    const instrumentation = new AzureOpenAIInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    azureOpenAIInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }
  try {
    const {
      LlamaIndexInstrumentation,
    } = require("@traceloop/instrumentation-llamaindex");
    const instrumentation = new LlamaIndexInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    llamaIndexInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }
  try {
    const {
      PineconeInstrumentation,
    } = require("@traceloop/instrumentation-pinecone");
    const instrumentation = new PineconeInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
  } catch (e) {
    /* empty */
  }
  const {
    VertexAIInstrumentation,
  } = require("@traceloop/instrumentation-vertexai");
  const instrumentation = new VertexAIInstrumentation();
  instrumentations.push(instrumentation);
  vertexaiInstrumentation = instrumentation;

  try {
    const {
      AIPlatformInstrumentation,
    } = require("@traceloop/instrumentation-vertexai");
    const instrumentation = new AIPlatformInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    aiplatformInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }

  try {
    const {
      LangChainInstrumentation,
    } = require("@traceloop/instrumentation-langchain");
    const instrumentation = new LangChainInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
  } catch (e) {
    /* empty */
  }

  try {
    const {
      BedrockInstrumentation,
    } = require("@traceloop/instrumentation-bedrock");
    const instrumentation = new BedrockInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    bedrockInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }

  try {
    const {
      CohereInstrumentation,
    } = require("@traceloop/instrumentation-cohere");
    const instrumentation = new CohereInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    cohereInstrumentation = instrumentation;
  } catch (e) {
    /* empty */
  }
};

export const manuallyInitInstrumentations = (
  instrumentModules: InitializeOptions["instrumentModules"],
) => {
  if (instrumentModules?.openAI) {
    const {
      OpenAIInstrumentation,
    } = require("@traceloop/instrumentation-openai");
    const instrumentation = new OpenAIInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    openAIInstrumentation = instrumentation;
    instrumentation.manuallyInstrument(instrumentModules.openAI);
  }

  if (instrumentModules?.llamaIndex) {
    const {
      LlamaIndexInstrumentation,
    } = require("@traceloop/instrumentation-llamaindex");
    const instrumentation = new LlamaIndexInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    llamaIndexInstrumentation = instrumentation;
    instrumentation.manuallyInstrument(instrumentModules.llamaIndex);
  }

  if (instrumentModules?.langchain) {
    const {
      LangChainInstrumentation,
    } = require("@traceloop/instrumentation-langchain");
    const instrumentation = new LangChainInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    instrumentation.manuallyInstrument(instrumentModules.langchain);
  }

  if (instrumentModules?.pinecone) {
    const {
      PineconeInstrumentation,
    } = require("@traceloop/instrumentation-pinecone");
    const instrumentation = new PineconeInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
  }

  if (instrumentModules?.google_vertexai) {
    const {
      VertexAIInstrumentation,
    } = require("@traceloop/instrumentation-vertexai");
    const instrumentation = new VertexAIInstrumentation();
    instrumentations.push(instrumentation);
    vertexaiInstrumentation = instrumentation;
  }

  if (instrumentModules?.google_aiplatform) {
    const {
      AIPlatformInstrumentation,
    } = require("@traceloop/instrumentation-vertexai");
    const instrumentation = new AIPlatformInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    aiplatformInstrumentation = instrumentation;
  }

  if (instrumentModules?.bedrock) {
    const {
      BedrockInstrumentation,
    } = require("@traceloop/instrumentation-bedrock");
    const instrumentation = new BedrockInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    bedrockInstrumentation = instrumentation;
  }

  if (instrumentModules?.azureOpenAI) {
    const {
      AzureOpenAIInstrumentation,
    } = require("@traceloop/instrumentation-azure");
    const instrumentation = new AzureOpenAIInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    azureOpenAIInstrumentation = instrumentation;
  }

  if (instrumentModules?.cohere) {
    const {
      CohereInstrumentation,
    } = require("@traceloop/instrumentation-cohere");
    const instrumentation = new CohereInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
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
  if (Object.keys(options.instrumentModules || {}).length > 0) {
    manuallyInitInstrumentations(options.instrumentModules);
  }
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
    cohereInstrumentation?.setConfig({
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
      [SEMRESATTRS_SERVICE_NAME]:
        options.appName || process.env.npm_package_name,
    }),
    spanProcessors: [_spanProcessor],
    traceExporter,
    instrumentations,
    // We should re-consider removing unrelevant spans here in the future
    // sampler: new TraceloopSampler(),
  });

  _sdk.start();
};

export const shouldSendTraces = () => {
  if (!_configuration) {
    diag.warn("Traceloop not initialized");
    return false;
  }

  const contextShouldSendPrompts = context
    .active()
    .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

  if (contextShouldSendPrompts !== undefined) {
    return contextShouldSendPrompts;
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
