import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  SpanProcessor,
  ReadableSpan,
} from "@opentelemetry/sdk-trace-node";
import { baggageUtils } from "@opentelemetry/core";
import { Span, context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  ASSOCATION_PROPERTIES_KEY,
  ENTITY_NAME_KEY,
  WORKFLOW_NAME_KEY,
} from "./tracing";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

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
}

/**
 * Creates a span processor with Traceloop's custom span handling logic.
 * This can be used independently of the full SDK initialization.
 * 
 * @param options - Configuration options for the span processor
 * @returns A configured SpanProcessor instance
 */
export const createSpanProcessor = (options: SpanProcessorOptions): SpanProcessor => {
  const headers =
    options.headers ||
    (process.env.TRACELOOP_HEADERS
      ? baggageUtils.parseKeyPairsIntoRecord(process.env.TRACELOOP_HEADERS)
      : { Authorization: `Bearer ${options.apiKey}` });

  const traceExporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: `${options.baseUrl || process.env.TRACELOOP_BASE_URL || "https://api.traceloop.com"}/v1/traces`,
      headers,
    });

  const spanProcessor = options.disableBatch
    ? new SimpleSpanProcessor(traceExporter)
    : new BatchSpanProcessor(traceExporter);

  spanProcessor.onStart = (span: Span) => {
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

  spanProcessor.onEnd = (span: ReadableSpan) => {
    // Vercel AI Adapters
    const attributes = span.attributes;

    // Adapt span names
    const nameMap: Record<string, string> = {
      "ai.generateText.doGenerate": "ai.generateText.generate",
      "ai.streamText.doStream": "ai.streamText.stream",
    };
    if (span.name in nameMap) {
      // Unfortunately, the span name is not writable as this is not the intended behavior
      // but it is a workaround to set the correct span name
      (span as any).name = nameMap[span.name];
    }

    if ("ai.response.text" in attributes) {
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] =
        attributes["ai.response.text"];
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
      delete attributes["ai.response.text"];
    }

    if ("ai.prompt.messages" in attributes) {
      try {
        const messages = JSON.parse(attributes["ai.prompt.messages"] as string);
        messages.forEach(
          (msg: { role: string; content: any }, index: number) => {
            attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
            attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
              msg.role;
          },
        );
        delete attributes["ai.prompt.messages"];
      } catch (e) {
        //Skip if JSON parsing fails
      }
    }

    if ("ai.usage.promptTokens" in attributes) {
      attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`] =
        attributes["ai.usage.promptTokens"];
      delete attributes["ai.usage.promptTokens"];
    }

    if ("ai.usage.completionTokens" in attributes) {
      attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`] =
        attributes["ai.usage.completionTokens"];
      delete attributes["ai.usage.completionTokens"];
    }

    if (
      attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`] &&
      attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]
    ) {
      attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`] =
        Number(attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]) +
        Number(attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]);
    }
  };

  // TODO: move this to the index.ts file
  // if (options.exporter) {
  //   Telemetry.getInstance().capture("tracer:init", {
  //     exporter: "custom",
  //     processor: options.disableBatch ? "simple" : "batch",
  //   });
  // } else {
  //   Telemetry.getInstance().capture("tracer:init", {
  //     exporter: options.baseUrl ?? "",
  //     processor: options.disableBatch ? "simple" : "batch",
  //   });
  // }

  return spanProcessor;
} 