import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  SpanProcessor,
  Span,
  ReadableSpan,
} from "@opentelemetry/sdk-trace-node";
import { context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  ASSOCATION_PROPERTIES_KEY,
  ENTITY_NAME_KEY,
  WORKFLOW_NAME_KEY,
  AGENT_NAME_KEY,
} from "./tracing";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  transformAiSdkSpanAttributes,
  transformAiSdkSpanNames,
} from "./ai-sdk-transformations";
import { parseKeyPairsIntoRecord } from "./baggage-utils";

export const ALL_INSTRUMENTATION_LIBRARIES = "all" as const;
type AllInstrumentationLibraries = typeof ALL_INSTRUMENTATION_LIBRARIES;

// Store agent names per trace for propagation to child spans (tool calls)
// Maps trace ID to {agentName, timestamp} for TTL-based cleanup
const traceAgentNames = new Map<
  string,
  { agentName: string; timestamp: number }
>();

// TTL for trace agent names (5 minutes)
const TRACE_AGENT_NAME_TTL = 5 * 60 * 1000;

/**
 * Cleans up expired trace agent name entries based on TTL
 */
const cleanupExpiredTraceAgentNames = (): void => {
  const now = Date.now();
  for (const [traceId, entry] of traceAgentNames.entries()) {
    if (now - entry.timestamp > TRACE_AGENT_NAME_TTL) {
      traceAgentNames.delete(traceId);
    }
  }
};

/**
 * Checks if a span is a root span (has no parent)
 */
const isRootSpan = (span: ReadableSpan): boolean => {
  const parentContext = span.parentSpanContext;
  return (
    !parentContext ||
    !parentContext.spanId ||
    parentContext.spanId === "0000000000000000"
  );
};

export interface SpanProcessorOptions {
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
   * Sends traces and spans without batching, for local development. Optional.
   * Defaults to false.
   */
  disableBatch?: boolean;

  /**
   * The OpenTelemetry SpanExporter to be used for sending traces data. Optional.
   * Defaults to the OTLP exporter.
   */
  exporter?: SpanExporter;

  /**
   * The headers to be sent with the traces data. Optional.
   */
  headers?: Record<string, string>;

  /**
   * The instrumentation libraries to be allowed in the traces. Optional.
   * Defaults to Traceloop instrumentation libraries.
   * If set to ALL_INSTRUMENTATION_LIBRARIES, all instrumentation libraries will be allowed.
   * If set to an array of instrumentation libraries, only traceloop instrumentation libraries and the specified instrumentation libraries will be allowed.
   */
  allowedInstrumentationLibraries?: string[] | AllInstrumentationLibraries;
}

/**
 * Creates a span processor with Traceloop's custom span handling logic.
 * This can be used independently of the full SDK initialization.
 *
 * @param options - Configuration options for the span processor
 * @returns A configured SpanProcessor instance
 */
export const createSpanProcessor = (
  options: SpanProcessorOptions,
): SpanProcessor => {
  const url = `${options.baseUrl || process.env.TRACELOOP_BASE_URL || "https://api.traceloop.com"}/v1/traces`;
  const headers =
    options.headers ||
    (process.env.TRACELOOP_HEADERS
      ? parseKeyPairsIntoRecord(process.env.TRACELOOP_HEADERS)
      : { Authorization: `Bearer ${options.apiKey}` });

  const traceExporter =
    options.exporter ??
    new OTLPTraceExporter({
      url,
      headers,
    });

  const spanProcessor = options.disableBatch
    ? new SimpleSpanProcessor(traceExporter)
    : new BatchSpanProcessor(traceExporter);

  // Store the original onEnd method
  const originalOnEnd = spanProcessor.onEnd.bind(spanProcessor);

  spanProcessor.onStart = onSpanStart;

  if (
    options.allowedInstrumentationLibraries === ALL_INSTRUMENTATION_LIBRARIES
  ) {
    spanProcessor.onEnd = onSpanEnd(originalOnEnd);
  } else {
    const instrumentationLibraries = [...traceloopInstrumentationLibraries];

    if (options.allowedInstrumentationLibraries) {
      instrumentationLibraries.push(...options.allowedInstrumentationLibraries);
    }

    spanProcessor.onEnd = onSpanEnd(originalOnEnd, instrumentationLibraries);
  }

  return spanProcessor;
};

export const traceloopInstrumentationLibraries = [
  "ai",
  "@traceloop/node-server-sdk",
  "@traceloop/instrumentation-openai",
  "@traceloop/instrumentation-langchain",
  "@traceloop/instrumentation-chroma",
  "@traceloop/instrumentation-anthropic",
  "@traceloop/instrumentation-llamaindex",
  "@traceloop/instrumentation-vertexai",
  "@traceloop/instrumentation-bedrock",
  "@traceloop/instrumentation-cohere",
  "@traceloop/instrumentation-pinecone",
  "@traceloop/instrumentation-qdrant",
  "@traceloop/instrumentation-together",
  "@traceloop/instrumentation-mcp",
];

/**
 * Handles span start event, enriching it with workflow and entity information
 */
const onSpanStart = (span: Span): void => {
  const workflowName = context.active().getValue(WORKFLOW_NAME_KEY);
  if (workflowName) {
    span.setAttribute(
      SpanAttributes.TRACELOOP_WORKFLOW_NAME,
      workflowName as string,
    );
  }

  const entityName = context.active().getValue(ENTITY_NAME_KEY);
  if (entityName) {
    span.setAttribute(
      SpanAttributes.TRACELOOP_ENTITY_PATH,
      entityName as string,
    );
  }

  const agentName = context.active().getValue(AGENT_NAME_KEY);
  if (agentName) {
    span.setAttribute(SpanAttributes.GEN_AI_AGENT_NAME, agentName as string);
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

  transformAiSdkSpanNames(span);
};

/**
 * Ensures span compatibility between OTel v1.x and v2.x for OTLP transformer
 */
const ensureSpanCompatibility = (span: ReadableSpan): ReadableSpan => {
  const spanAny = span as any;

  // If the span already has instrumentationLibrary, it's compatible (OTel v2.x)
  if (spanAny.instrumentationLibrary) {
    return span;
  }

  // If it has instrumentationScope but no instrumentationLibrary (OTel v1.x),
  // add instrumentationLibrary as an alias to prevent OTLP transformer errors
  if (spanAny.instrumentationScope) {
    // Create a proxy that provides both properties
    return new Proxy(span, {
      get(target, prop) {
        if (prop === "instrumentationLibrary") {
          return (target as any).instrumentationScope;
        }
        return (target as any)[prop];
      },
    }) as ReadableSpan;
  }

  // Fallback: add both properties with defaults
  return new Proxy(span, {
    get(target, prop) {
      if (
        prop === "instrumentationLibrary" ||
        prop === "instrumentationScope"
      ) {
        return {
          name: "unknown",
          version: undefined,
          schemaUrl: undefined,
        };
      }
      return (target as any)[prop];
    },
  }) as ReadableSpan;
};

/**
 * Handles span end event, adapting attributes for Vercel AI compatibility
 * and ensuring OTLP transformer compatibility
 */
const onSpanEnd = (
  originalOnEnd: (span: ReadableSpan) => void,
  instrumentationLibraries?: string[],
) => {
  return (span: ReadableSpan): void => {
    if (
      instrumentationLibraries &&
      !instrumentationLibraries.includes(
        (span as any).instrumentationScope?.name ||
          (span as any).instrumentationLibrary?.name,
      )
    ) {
      return;
    }

    // Apply AI SDK transformations (if needed)
    transformAiSdkSpanAttributes(span);

    // Handle agent name propagation for AI SDK spans
    const traceId = span.spanContext().traceId;
    const agentName = span.attributes[SpanAttributes.GEN_AI_AGENT_NAME];

    if (agentName && typeof agentName === "string") {
      // Store agent name for this trace with current timestamp
      traceAgentNames.set(traceId, {
        agentName,
        timestamp: Date.now(),
      });
    } else if (!agentName && traceAgentNames.has(traceId)) {
      // This span doesn't have agent name but trace does - propagate it
      span.attributes[SpanAttributes.GEN_AI_AGENT_NAME] =
        traceAgentNames.get(traceId)!.agentName;
    }

    // Clean up trace agent name when root span ends
    if (isRootSpan(span) && traceAgentNames.has(traceId)) {
      traceAgentNames.delete(traceId);
    }

    // Periodically clean up expired entries (every 100 spans as a safety net)
    if (Math.random() < 0.01) {
      cleanupExpiredTraceAgentNames();
    }

    // Ensure OTLP transformer compatibility
    const compatibleSpan = ensureSpanCompatibility(span);

    originalOnEnd(compatibleSpan);
  };
};
