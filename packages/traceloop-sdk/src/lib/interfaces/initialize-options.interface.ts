import { SpanExporter, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { TextMapPropagator, ContextManager } from "@opentelemetry/api";
import type * as openai from "openai";
import type * as anthropic from "@anthropic-ai/sdk";
import type * as azure from "@azure/openai";
import type * as cohere from "cohere-ai";
import type * as bedrock from "@aws-sdk/client-bedrock-runtime";
import type * as aiplatform from "@google-cloud/aiplatform";
import type * as vertexAI from "@google-cloud/vertexai";
import type * as pinecone from "@pinecone-database/pinecone";
import type * as ChainsModule from "langchain/chains";
import type * as AgentsModule from "langchain/agents";
import type * as ToolsModule from "langchain/tools";
import type * as RunnableModule from "@langchain/core/runnables";
import type * as VectorStoreModule from "@langchain/core/vectorstores";
import type * as llamaindex from "llamaindex";
import type * as chromadb from "chromadb";
import type * as qdrant from "@qdrant/js-client-rest";

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
   * The API Key for sending traces data. Optional.
   * Defaults to the TRACELOOP_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * The OTLP endpoint for sending traces data. Optional.
   * Defaults to TRACELOOP_BASE_URL environment variable or https://api.traceloop.com/
   */
  baseUrl?: string;

  /**
   * Sends traces and spans without batching, for local developement. Optional.
   * Defaults to false.
   */
  disableBatch?: boolean;

  /**
   * Defines default log level for SDK and all instrumentations. Optional.
   * Defaults to error.
   */
  logLevel?: "debug" | "info" | "warn" | "error";

  /**
   * Whether to log prompts, completions and embeddings on traces. Optional.
   * Defaults to true.
   */
  traceContent?: boolean;

  /**
   * The OpenTelemetry SpanExporter to be used for sending traces data. Optional.
   * Defaults to the OTLP exporter.
   */
  exporter?: SpanExporter;

  /**
   * The OpenTelemetry SpanProcessor to be used for processing traces data. Optional.
   * Defaults to the BatchSpanProcessor.
   */
  processor?: SpanProcessor;

  /**
   * The OpenTelemetry Propagator to use. Optional.
   * Defaults to OpenTelemetry SDK defaults.
   */
  propagator?: TextMapPropagator;

  /**
   * The OpenTelemetry ContextManager to use. Optional.
   * Defaults to OpenTelemetry SDK defaults.
   */
  contextManager?: ContextManager;

  /**
   * Explicitly specify modules to instrument. Optional.
   * This is a workaround specific to Next.js, see https://www.traceloop.com/docs/openllmetry/getting-started-nextjs
   */
  instrumentModules?: {
    openAI?: typeof openai.OpenAI;
    anthropic?: typeof anthropic;
    azureOpenAI?: typeof azure;
    cohere?: typeof cohere;
    bedrock?: typeof bedrock;
    google_vertexai?: typeof vertexAI;
    google_aiplatform?: typeof aiplatform;
    pinecone?: typeof pinecone;
    langchain?: {
      chainsModule?: typeof ChainsModule;
      agentsModule?: typeof AgentsModule;
      toolsModule?: typeof ToolsModule;
      runnablesModule?: typeof RunnableModule;
      vectorStoreModule?: typeof VectorStoreModule;
    };
    llamaIndex?: typeof llamaindex;
    chromadb?: typeof chromadb;
    qdrant?: typeof qdrant;
  };

  /**
   * Enables sync with Traceloop servers for the prompt registry functionality. Optional.
   * Defaults to TRACELOOP_SYNC_ENABLED environment variable or true if not set.
   */
  traceloopSyncEnabled?: boolean;

  /**
   * Defines the number of retires when fetching prompt data for the registry. Optional.
   * Defaults to TRACELOOP_SYNC_MAX_RETRIES environment variable or 3 if not set.
   */
  traceloopSyncMaxRetries?: number;

  /**
   * Defines the polling interval for the prompt registry. Optional.
   * Defaults to TRACELOOP_SYNC_POLLING_INTERVAL environment variable or 60 if not set.
   */
  traceloopSyncPollingInterval?: number;

  /**
   * Defines the polling interval for the prompt registry. Optional.
   * Defaults to TRACELOOP_SYNC_DEV_POLLING_INTERVAL environment variable or 5 if not set.
   */
  traceloopSyncDevPollingInterval?: number;

  /**
   * Whether to silence the initialization message. Optional.
   * Defaults to false.
   */
  silenceInitializationMessage?: boolean;
}
