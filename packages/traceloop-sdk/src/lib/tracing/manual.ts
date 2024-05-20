import { Span, context, trace } from "@opentelemetry/api";
import { getTracer } from "./tracing";
import {
  Events,
  EventAttributes,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
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
      [SpanAttributes.LLM_REQUEST_MODEL]: model,
    });

    messages.forEach((message, index) => {
      this.span.setAttributes({
        [`${SpanAttributes.LLM_PROMPTS}.${index}.role`]: message.role,
        [`${SpanAttributes.LLM_PROMPTS}.${index}.content`]:
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
    this.span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, model);

    if (usage) {
      this.span.setAttributes({
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.prompt_tokens,
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: usage.completion_tokens,
        [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: usage.total_tokens,
      });
    }

    completions?.forEach((completion, index) => {
      this.span.setAttributes({
        [`${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`]:
          completion.finish_reason,
        [`${SpanAttributes.LLM_COMPLETIONS}.${index}.role`]:
          completion.message.role,
        [`${SpanAttributes.LLM_COMPLETIONS}.${index}.content`]:
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
  const span = getTracer().startSpan(`${vendor}.${type}`, {}, context.active());
  span.setAttribute(SpanAttributes.LLM_REQUEST_TYPE, type);
  trace.setSpan(context.active(), span);

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
