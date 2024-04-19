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
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import { AnthropicInstrumentation } from "@traceloop/instrumentation-anthropic";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";
import { AzureOpenAIInstrumentation } from "@traceloop/instrumentation-azure";
import { LlamaIndexInstrumentation } from "@traceloop/instrumentation-llamaindex";
import {
  AIPlatformInstrumentation,
  VertexAIInstrumentation,
} from "@traceloop/instrumentation-vertexai";
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock";
import { CohereInstrumentation } from "@traceloop/instrumentation-cohere";
import { PineconeInstrumentation } from "@traceloop/instrumentation-pinecone";
import { LangChainInstrumentation } from "@traceloop/instrumentation-langchain";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: OpenAIInstrumentation | undefined;
let anthropicInstrumentation: AnthropicInstrumentation | undefined;
let azureOpenAIInstrumentation: AzureOpenAIInstrumentation | undefined;
let cohereInstrumentation: CohereInstrumentation | undefined;
let vertexaiInstrumentation: VertexAIInstrumentation | undefined;
let aiplatformInstrumentation: AIPlatformInstrumentation | undefined;
let bedrockInstrumentation: BedrockInstrumentation | undefined;
let langchainInstrumentation: LangChainInstrumentation | undefined;
let llamaIndexInstrumentation: LlamaIndexInstrumentation | undefined;
let pineconeInstrumentation: PineconeInstrumentation | undefined;

const instrumentations: Instrumentation[] = [];

export const initInstrumentations = () => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);

  openAIInstrumentation = new OpenAIInstrumentation({
    enrichTokens: _configuration?.shouldEnrichMetrics,
    exceptionLogger,
  });
  instrumentations.push(openAIInstrumentation);

  anthropicInstrumentation = new AnthropicInstrumentation({ exceptionLogger });
  instrumentations.push(anthropicInstrumentation);

  azureOpenAIInstrumentation = new AzureOpenAIInstrumentation({
    exceptionLogger,
  });
  instrumentations.push(azureOpenAIInstrumentation);

  cohereInstrumentation = new CohereInstrumentation({ exceptionLogger });
  instrumentations.push(cohereInstrumentation);

  vertexaiInstrumentation = new VertexAIInstrumentation();
  instrumentations.push(vertexaiInstrumentation);

  aiplatformInstrumentation = new AIPlatformInstrumentation();
  instrumentations.push(aiplatformInstrumentation);

  bedrockInstrumentation = new BedrockInstrumentation({ exceptionLogger });
  instrumentations.push(bedrockInstrumentation);

  pineconeInstrumentation = new PineconeInstrumentation();
  instrumentations.push(pineconeInstrumentation);

  langchainInstrumentation = new LangChainInstrumentation();
  instrumentations.push(langchainInstrumentation);

  llamaIndexInstrumentation = new LlamaIndexInstrumentation();
  instrumentations.push(llamaIndexInstrumentation);
};

export const manuallyInitInstrumentations = (
  instrumentModules: InitializeOptions["instrumentModules"],
) => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);

  // Clear the instrumentations array that was initialized by default
  instrumentations.length = 0;

  if (instrumentModules?.openAI) {
    openAIInstrumentation = new OpenAIInstrumentation({
      enrichTokens: _configuration?.shouldEnrichMetrics,
      exceptionLogger,
    });
    instrumentations.push(openAIInstrumentation);
    openAIInstrumentation.manuallyInstrument(instrumentModules.openAI);
  }

  if (instrumentModules?.anthropic) {
    anthropicInstrumentation = new AnthropicInstrumentation({
      exceptionLogger,
    });
    instrumentations.push(anthropicInstrumentation);
    anthropicInstrumentation.manuallyInstrument(instrumentModules.anthropic);
  }

  if (instrumentModules?.azureOpenAI) {
    const instrumentation = new AzureOpenAIInstrumentation({ exceptionLogger });
    instrumentations.push(instrumentation as Instrumentation);
    azureOpenAIInstrumentation = instrumentation;
    instrumentation.manuallyInstrument(instrumentModules.azureOpenAI);
  }

  if (instrumentModules?.cohere) {
    cohereInstrumentation = new CohereInstrumentation({ exceptionLogger });
    instrumentations.push(cohereInstrumentation);
    cohereInstrumentation.manuallyInstrument(instrumentModules.cohere);
  }

  if (instrumentModules?.google_vertexai) {
    vertexaiInstrumentation = new VertexAIInstrumentation();
    instrumentations.push(vertexaiInstrumentation);
    vertexaiInstrumentation.manuallyInstrument(
      instrumentModules.google_vertexai,
    );
  }

  if (instrumentModules?.google_aiplatform) {
    aiplatformInstrumentation = new AIPlatformInstrumentation();
    instrumentations.push(aiplatformInstrumentation);
    aiplatformInstrumentation.manuallyInstrument(
      instrumentModules.google_aiplatform,
    );
  }

  if (instrumentModules?.bedrock) {
    bedrockInstrumentation = new BedrockInstrumentation({ exceptionLogger });
    instrumentations.push(bedrockInstrumentation);
    bedrockInstrumentation.manuallyInstrument(instrumentModules.bedrock);
  }

  if (instrumentModules?.pinecone) {
    const instrumentation = new PineconeInstrumentation();
    instrumentations.push(instrumentation as Instrumentation);
    instrumentation.manuallyInstrument(instrumentModules.pinecone);
  }

  if (instrumentModules?.langchain) {
    langchainInstrumentation = new LangChainInstrumentation();
    instrumentations.push(langchainInstrumentation);
    langchainInstrumentation.manuallyInstrument(instrumentModules.langchain);
  }

  if (instrumentModules?.llamaIndex) {
    llamaIndexInstrumentation = new LlamaIndexInstrumentation();
    instrumentations.push(llamaIndexInstrumentation);
    llamaIndexInstrumentation.manuallyInstrument(instrumentModules.llamaIndex);
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
