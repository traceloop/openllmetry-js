import { NodeSDK } from "@opentelemetry/sdk-node";
import { SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { baggageUtils } from "@opentelemetry/core";
import { context, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Instrumentation } from "@opentelemetry/instrumentation";
import { InitializeOptions } from "../interfaces";
import { Telemetry } from "../telemetry/telemetry";
import { _configuration } from "../configuration";
import { CONTEXT_KEY_ALLOW_TRACE_CONTENT } from "@traceloop/ai-semantic-conventions";
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
import { ChromaDBInstrumentation } from "@traceloop/instrumentation-chromadb";
import { QdrantInstrumentation } from "@traceloop/instrumentation-qdrant";
import { TogetherInstrumentation } from "@traceloop/instrumentation-together";
import { McpInstrumentation } from "@traceloop/instrumentation-mcp";
import {
  ALL_INSTRUMENTATION_LIBRARIES,
  createSpanProcessor,
} from "./span-processor";

let _sdk: NodeSDK;
let _spanProcessor: SpanProcessor;
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
let chromadbInstrumentation: ChromaDBInstrumentation | undefined;
let qdrantInstrumentation: QdrantInstrumentation | undefined;
let togetherInstrumentation: TogetherInstrumentation | undefined;
let mcpInstrumentation: McpInstrumentation | undefined;

const instrumentations: Instrumentation[] = [];

export const initInstrumentations = () => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);
  const enrichTokens =
    (process.env.TRACELOOP_ENRICH_TOKENS || "true").toLowerCase() === "true";

  openAIInstrumentation = new OpenAIInstrumentation({
    enrichTokens,
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

  vertexaiInstrumentation = new VertexAIInstrumentation({
    exceptionLogger,
  });
  instrumentations.push(vertexaiInstrumentation);

  aiplatformInstrumentation = new AIPlatformInstrumentation({
    exceptionLogger,
  });
  instrumentations.push(aiplatformInstrumentation);

  bedrockInstrumentation = new BedrockInstrumentation({ exceptionLogger });
  instrumentations.push(bedrockInstrumentation);

  pineconeInstrumentation = new PineconeInstrumentation({ exceptionLogger });
  instrumentations.push(pineconeInstrumentation);

  langchainInstrumentation = new LangChainInstrumentation({ exceptionLogger });
  instrumentations.push(langchainInstrumentation);

  llamaIndexInstrumentation = new LlamaIndexInstrumentation({
    exceptionLogger,
  });
  instrumentations.push(llamaIndexInstrumentation);

  chromadbInstrumentation = new ChromaDBInstrumentation({ exceptionLogger });
  instrumentations.push(chromadbInstrumentation);

  qdrantInstrumentation = new QdrantInstrumentation({ exceptionLogger });
  instrumentations.push(qdrantInstrumentation);

  togetherInstrumentation = new TogetherInstrumentation({ exceptionLogger });
  instrumentations.push(togetherInstrumentation);

  mcpInstrumentation = new McpInstrumentation({ exceptionLogger });
  instrumentations.push(mcpInstrumentation);
};

export const manuallyInitInstrumentations = (
  instrumentModules: InitializeOptions["instrumentModules"],
) => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);
  const enrichTokens =
    (process.env.TRACELOOP_ENRICH_TOKENS || "true").toLowerCase() === "true";

  // Clear the instrumentations array that was initialized by default
  instrumentations.length = 0;

  if (instrumentModules?.openAI) {
    openAIInstrumentation = new OpenAIInstrumentation({
      enrichTokens,
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
    vertexaiInstrumentation = new VertexAIInstrumentation({
      exceptionLogger,
    });
    instrumentations.push(vertexaiInstrumentation);
    vertexaiInstrumentation.manuallyInstrument(
      instrumentModules.google_vertexai,
    );
  }

  if (instrumentModules?.google_aiplatform) {
    aiplatformInstrumentation = new AIPlatformInstrumentation({
      exceptionLogger,
    });
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
    const instrumentation = new PineconeInstrumentation({ exceptionLogger });
    instrumentations.push(instrumentation as Instrumentation);
    instrumentation.manuallyInstrument(instrumentModules.pinecone);
  }

  if (instrumentModules?.langchain) {
    langchainInstrumentation = new LangChainInstrumentation({
      exceptionLogger,
    });
    instrumentations.push(langchainInstrumentation);
    langchainInstrumentation.manuallyInstrument(instrumentModules.langchain);
  }

  if (instrumentModules?.llamaIndex) {
    llamaIndexInstrumentation = new LlamaIndexInstrumentation({
      exceptionLogger,
    });
    instrumentations.push(llamaIndexInstrumentation);
    llamaIndexInstrumentation.manuallyInstrument(instrumentModules.llamaIndex);
  }

  if (instrumentModules?.chromadb) {
    chromadbInstrumentation = new ChromaDBInstrumentation({ exceptionLogger });
    instrumentations.push(chromadbInstrumentation);
    chromadbInstrumentation.manuallyInstrument(instrumentModules.chromadb);
  }

  if (instrumentModules?.qdrant) {
    qdrantInstrumentation = new QdrantInstrumentation({ exceptionLogger });
    instrumentations.push(qdrantInstrumentation);
    qdrantInstrumentation.manuallyInstrument(instrumentModules.qdrant);
  }

  if (instrumentModules?.together) {
    togetherInstrumentation = new TogetherInstrumentation({ exceptionLogger });
    instrumentations.push(togetherInstrumentation);
    togetherInstrumentation.manuallyInstrument(instrumentModules.together);
  }

  if (instrumentModules?.mcp) {
    mcpInstrumentation = new McpInstrumentation({ exceptionLogger });
    instrumentations.push(mcpInstrumentation);
    // @ts-ignore
    mcpInstrumentation.manuallyInstrument(instrumentModules.mcp);
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
    chromadbInstrumentation?.setConfig({
      traceContent: false,
    });
    togetherInstrumentation?.setConfig({
      traceContent: false,
    });
    mcpInstrumentation?.setConfig({
      traceContent: false,
    });
  }

  const headers =
    options.headers ||
    (process.env.TRACELOOP_HEADERS
      ? baggageUtils.parseKeyPairsIntoRecord(process.env.TRACELOOP_HEADERS)
      : { Authorization: `Bearer ${options.apiKey}` });

  const traceExporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: `${options.baseUrl}/v1/traces`,
      headers,
    });

  _spanProcessor = createSpanProcessor({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    disableBatch: options.disableBatch,
    exporter: traceExporter,
    headers,
    allowedInstrumentationLibraries: ALL_INSTRUMENTATION_LIBRARIES,
  });

  const spanProcessors: SpanProcessor[] = [_spanProcessor];
  if (options.processor) {
    spanProcessors.push(options.processor);
  }

  _sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.appName || process.env.npm_package_name,
    }),
    spanProcessors,
    contextManager: options.contextManager,
    textMapPropagator: options.propagator,
    traceExporter,
    instrumentations,
    // We should re-consider removing irrelevant spans here in the future
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
