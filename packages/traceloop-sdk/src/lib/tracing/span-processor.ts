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

// Store agent names per span for hierarchical propagation to child spans
// Maps span ID to {agentName, timestamp} for TTL-based cleanup
// This enables proper nested agent support where each agent's tools inherit
// the correct agent name from their immediate parent, not the root agent
const spanAgentNames = new Map<
  string,
  { agentName: string; timestamp: number }
>();

// TTL for span agent names (5 minutes)
const SPAN_AGENT_NAME_TTL = 5 * 60 * 1000;

// Attribute name for AI SDK telemetry metadata agent
const AI_TELEMETRY_METADATA_AGENT = "ai.telemetry.metadata.agent";

/**
 * Cleans up expired span agent name entries based on TTL
 */
const cleanupExpiredSpanAgentNames = (): void => {
  const now = Date.now();
  for (const [spanId, entry] of spanAgentNames.entries()) {
    if (now - entry.timestamp > SPAN_AGENT_NAME_TTL) {
      spanAgentNames.delete(spanId);
    }
  }
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
 * Handles span start event, enriching it with workflow and entity information.
 * Also captures agent names early for proper nested agent propagation.
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

  // Determine agent name from context (SDK decorators) or AI SDK metadata
  let agentName = context.active().getValue(AGENT_NAME_KEY) as
    | string
    | undefined;

  // Also check for AI SDK telemetry metadata agent (for early capture)
  if (!agentName) {
    const aiSdkAgent = span.attributes[AI_TELEMETRY_METADATA_AGENT];
    if (aiSdkAgent && typeof aiSdkAgent === "string") {
      agentName = aiSdkAgent;
    }
  }

  // If no agent name from context or AI SDK, check parent span
  if (!agentName) {
    const parentSpanContext = (span as any).parentSpanContext;
    const parentSpanId = parentSpanContext?.spanId;
    if (
      parentSpanId &&
      parentSpanId !== "0000000000000000" &&
      spanAgentNames.has(parentSpanId)
    ) {
      agentName = spanAgentNames.get(parentSpanId)!.agentName;
    }
  }

  if (agentName) {
    span.setAttribute(SpanAttributes.GEN_AI_AGENT_NAME, agentName);
    // Store for child span inheritance (hierarchical propagation)
    const spanId = span.spanContext().spanId;
    spanAgentNames.set(spanId, { agentName, timestamp: Date.now() });
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
 * and ensuring OTLP transformer compatibility.
 * Uses span-hierarchy-based agent name propagation for proper nested agent support.
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

    // Handle agent name propagation using span hierarchy (not trace-level)
    const spanId = span.spanContext().spanId;
    const parentSpanId = span.parentSpanContext?.spanId;
    let agentName = span.attributes[SpanAttributes.GEN_AI_AGENT_NAME];

    if (agentName && typeof agentName === "string") {
      // This span has its own agent name - store for any late-arriving children
      spanAgentNames.set(spanId, {
        agentName,
        timestamp: Date.now(),
      });
    } else if (
      parentSpanId &&
      parentSpanId !== "0000000000000000" &&
      spanAgentNames.has(parentSpanId)
    ) {
      // Inherit agent name from parent span (hierarchical propagation)
      agentName = spanAgentNames.get(parentSpanId)!.agentName;
      span.attributes[SpanAttributes.GEN_AI_AGENT_NAME] = agentName;
      // Store for this span's potential children
      spanAgentNames.set(spanId, {
        agentName,
        timestamp: Date.now(),
      });
    }

    // Periodically clean up expired entries (every 100 spans as a safety net)
    if (Math.random() < 0.01) {
      cleanupExpiredSpanAgentNames();
    }

    // Ensure OTLP transformer compatibility
    const compatibleSpan = ensureSpanCompatibility(span);

    originalOnEnd(compatibleSpan);
  };
};
