import { NodeSDK } from "@opentelemetry/sdk-node";
import { SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { context, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { TraceExporter as GcpTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Instrumentation } from "@opentelemetry/instrumentation";
import { InitializeOptions } from "../interfaces";
import { Telemetry } from "../telemetry/telemetry";
import { _configuration } from "../configuration";
import { CONTEXT_KEY_ALLOW_TRACE_CONTENT } from "@traceloop/ai-semantic-conventions";
import { AnthropicInstrumentation } from "@traceloop/instrumentation-anthropic";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";
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
import { parseKeyPairsIntoRecord } from "./baggage-utils";
import { ImageUploader } from "../images";

let _sdk: NodeSDK;
let _spanProcessor: SpanProcessor;
let openAIInstrumentation: OpenAIInstrumentation | undefined;
let anthropicInstrumentation: AnthropicInstrumentation | undefined;
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

export const initInstrumentations = (apiKey?: string, baseUrl?: string) => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);
  const enrichTokens =
    (process.env.TRACELOOP_ENRICH_TOKENS || "true").toLowerCase() === "true";

  // Create image upload callback if we have credentials
  let uploadBase64ImageCallback;
  if (apiKey && baseUrl) {
    const imageUploader = new ImageUploader(baseUrl, apiKey);
    uploadBase64ImageCallback =
      imageUploader.uploadBase64Image.bind(imageUploader);
  }

  // Create or update OpenAI instrumentation
  if (openAIInstrumentation) {
    // Update existing instrumentation with new callback
    openAIInstrumentation.setConfig({
      enrichTokens,
      exceptionLogger,
      uploadBase64Image: uploadBase64ImageCallback,
    });
  } else {
    // Create new instrumentation
    openAIInstrumentation = new OpenAIInstrumentation({
      enrichTokens,
      exceptionLogger,
      uploadBase64Image: uploadBase64ImageCallback,
    });
    instrumentations.push(openAIInstrumentation);
  }

  if (!anthropicInstrumentation) {
    anthropicInstrumentation = new AnthropicInstrumentation({
      exceptionLogger,
    });
    instrumentations.push(anthropicInstrumentation);
  }

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
  apiKey?: string,
  baseUrl?: string,
) => {
  const exceptionLogger = (e: Error) => Telemetry.getInstance().logException(e);
  const enrichTokens =
    (process.env.TRACELOOP_ENRICH_TOKENS || "true").toLowerCase() === "true";

  // Create image upload callback if we have credentials
  let uploadBase64ImageCallback;
  if (apiKey && baseUrl) {
    const imageUploader = new ImageUploader(baseUrl, apiKey);
    uploadBase64ImageCallback =
      imageUploader.uploadBase64Image.bind(imageUploader);
  }

  // Clear the instrumentations array that was initialized by default
  instrumentations.length = 0;

  if (instrumentModules?.openAI) {
    openAIInstrumentation = new OpenAIInstrumentation({
      enrichTokens,
      exceptionLogger,
      uploadBase64Image: uploadBase64ImageCallback,
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

  // Always enable LangChain instrumentation
  langchainInstrumentation = new LangChainInstrumentation({
    exceptionLogger,
  });
  instrumentations.push(langchainInstrumentation);

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
  const apiKey = options.apiKey || process.env.TRACELOOP_API_KEY;
  const baseUrl =
    options.baseUrl ||
    process.env.TRACELOOP_BASE_URL ||
    "https://api.traceloop.com";

  if (Object.keys(options.instrumentModules || {}).length > 0) {
    manuallyInitInstrumentations(options.instrumentModules, apiKey, baseUrl);
  } else {
    // Initialize default instrumentations if no manual modules specified
    initInstrumentations(apiKey, baseUrl);
  }
  if (!shouldSendTraces()) {
    openAIInstrumentation?.setConfig({
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
  }

  const headers =
    options.headers ||
    (process.env.TRACELOOP_HEADERS
      ? parseKeyPairsIntoRecord(process.env.TRACELOOP_HEADERS)
      : { Authorization: `Bearer ${options.apiKey}` });

  const traceExporter =
    options.exporter ??
    (options.gcpProjectId
      ? new GcpTraceExporter({ projectId: options.gcpProjectId })
      : new OTLPTraceExporter({
          url: `${baseUrl}/v1/traces`,
          headers,
        }));

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

  const resource = createResource({
    [ATTR_SERVICE_NAME]:
      options.appName || process.env.npm_package_name || "unknown_service",
  });

  _sdk = new NodeSDK({
    resource,
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

// Compatibility function for creating resources that works with both OTel v1.x and v2.x
function createResource(attributes: Record<string, any>): Resource {
  // Import the resource module at runtime to handle both v1.x and v2.x
  const resourcesModule = require("@opentelemetry/resources");

  // Try to use resourceFromAttributes if it exists (OTel v2.x)
  if (resourcesModule.resourceFromAttributes) {
    return resourcesModule.resourceFromAttributes(attributes);
  }

  // Fallback to constructor for OTel v1.x
  return new resourcesModule.Resource(attributes);
}
