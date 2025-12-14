import { Span, context, trace } from "@opentelemetry/api";
import { getTracer, AGENT_NAME_KEY } from "./tracing";
import {
  Events,
  EventAttributes,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_COMPLETION,
  ATTR_GEN_AI_PROMPT,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";
import { shouldSendTraces } from ".";

type VectorDBCallConfig = {
  vendor: string;
  type: "query" | "upsert" | "delete";
};

type LLMCallConfig = {
  vendor: string;
  type: "chat" | "completion";
};

export class VectorSpan {
  private span: Span;

  constructor(span: Span) {
    this.span = span;
  }

  reportQuery({ queryVector }: { queryVector: number[] }) {
    if (!shouldSendTraces()) {
      this.span.addEvent(Events.DB_QUERY_EMBEDDINGS);
    }

    this.span.addEvent(Events.DB_QUERY_EMBEDDINGS, {
      [EventAttributes.DB_QUERY_EMBEDDINGS_VECTOR]: JSON.stringify(queryVector),
    });
  }

  reportResults({
    results,
  }: {
    results: {
      ids?: string;
      scores?: number;
      distances?: number;
      metadata?: Record<string, unknown>;
      vectors?: number[];
      documents?: string;
    }[];
  }) {
    for (let i = 0; i < results.length; i++) {
      this.span.addEvent(Events.DB_QUERY_RESULT, {
        [EventAttributes.DB_QUERY_RESULT_ID]: results[i].ids,
        [EventAttributes.DB_QUERY_RESULT_SCORE]: results[i].scores,
        [EventAttributes.DB_QUERY_RESULT_DISTANCE]: results[i].distances,
        [EventAttributes.DB_QUERY_RESULT_METADATA]: JSON.stringify(
          results[i].metadata,
        ),
        [EventAttributes.DB_QUERY_RESULT_VECTOR]: results[i].vectors,
        [EventAttributes.DB_QUERY_RESULT_DOCUMENT]: results[i].documents,
      });
    }
  }
}

export class LLMSpan {
  private span: Span;

  constructor(span: Span) {
    this.span = span;
  }

  reportRequest({
    model,
    messages,
  }: {
    model: string;
    messages: {
      role: string;
      content?: string | unknown;
    }[];
  }) {
    this.span.setAttributes({
      [ATTR_GEN_AI_REQUEST_MODEL]: model,
    });

    messages.forEach((message, index) => {
      this.span.setAttributes({
        [`${ATTR_GEN_AI_PROMPT}.${index}.role`]: message.role,
        [`${ATTR_GEN_AI_PROMPT}.${index}.content`]:
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
      });
    });
  }

  reportResponse({
    model,
    usage,
    completions,
  }: {
    model: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    completions?: {
      finish_reason: string;
      message: {
        role: "system" | "user" | "assistant";
        content: string | null;
      };
    }[];
  }) {
    this.span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);

    if (usage) {
      this.span.setAttributes({
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage.prompt_tokens,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage.completion_tokens,
        [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: usage.total_tokens,
      });
    }

    completions?.forEach((completion, index) => {
      this.span.setAttributes({
        [`${ATTR_GEN_AI_COMPLETION}.${index}.finish_reason`]:
          completion.finish_reason,
        [`${ATTR_GEN_AI_COMPLETION}.${index}.role`]: completion.message.role,
        [`${ATTR_GEN_AI_COMPLETION}.${index}.content`]:
          completion.message.content || "",
      });
    });
  }
}

export function withVectorDBCall<
  F extends ({ span }: { span: VectorSpan }) => ReturnType<F>,
>({ vendor, type }: VectorDBCallConfig, fn: F, thisArg?: ThisParameterType<F>) {
  const entityContext = context.active();

  return getTracer().startActiveSpan(
    `${vendor}.${type}`,
    { [SpanAttributes.LLM_REQUEST_TYPE]: type },
    entityContext,
    (span: Span) => {
      // Set agent name if there's an active agent context
      const agentName = entityContext.getValue(AGENT_NAME_KEY);
      if (agentName) {
        span.setAttribute(ATTR_GEN_AI_AGENT_NAME, agentName as string);
      }

      const res = fn.apply(thisArg, [{ span: new VectorSpan(span) }]);
      if (res instanceof Promise) {
        return res.then((resolvedRes) => {
          span.end();
          return resolvedRes;
        });
      }

      span.end();
      return res;
    },
  );
}

export function withLLMCall<
  F extends ({ span }: { span: LLMSpan }) => ReturnType<F>,
>({ vendor, type }: LLMCallConfig, fn: F, thisArg?: ThisParameterType<F>) {
  const currentContext = context.active();
  const span = getTracer().startSpan(`${vendor}.${type}`, {}, currentContext);
  span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, type);

  // Set agent name if there's an active agent context
  const agentName = currentContext.getValue(AGENT_NAME_KEY);
  if (agentName) {
    span.setAttribute(ATTR_GEN_AI_AGENT_NAME, agentName as string);
  }

  trace.setSpan(currentContext, span);

  const res = fn.apply(thisArg, [{ span: new LLMSpan(span) }]);
  if (res instanceof Promise) {
    return res.then((resolvedRes) => {
      span.end();
      return resolvedRes;
    });
  }

  span.end();
  return res;
}
