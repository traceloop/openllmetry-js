import { Span, context } from "@opentelemetry/api";
import { getTracer } from "./tracing";
import { Events, EventAttributes } from "@traceloop/ai-semantic-conventions";
import { shouldSendTraces } from ".";

type VectorDBCallConfig = {
  vendor: string;
  type: "query" | "upsert" | "delete";
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

export function withVectorDBCall<
  F extends ({ span }: { span: VectorSpan }) => ReturnType<F>,
>({ vendor, type }: VectorDBCallConfig, fn: F, thisArg?: ThisParameterType<F>) {
  const entityContext = context.active();

  getTracer().startActiveSpan(
    `${vendor}.${type}`,
    {},
    entityContext,
    async (span: Span) => {
      const res = fn.apply(thisArg, [{ span: new VectorSpan(span) }]);
      if (res instanceof Promise) {
        return res.then(() => {
          span.end();
        });
      }

      span.end();
    },
  );
}
