/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  Span,
  SpanKind,
  SpanStatusCode,
  context,
  trace,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { QdrantInstrumentationConfig } from "./types";
import type * as qdrant from "@qdrant/js-client-rest";
import { version } from "../package.json";
import {
  SpanAttributes,
  EventAttributes,
} from "@traceloop/ai-semantic-conventions";

const UPSERT = "upsert";
const DELETE = "delete";
const RETRIEVE = "retrieve";
const SEARCH = "search";

type UpsertRequest = qdrant.Schemas["PointInsertOperations"];
type DeleteRequest = qdrant.Schemas["PointsSelector"];
type RetrieveRequest = qdrant.Schemas["PointRequest"];
type SearchRequest = qdrant.Schemas["SearchRequest"];
type SearchResponse = Awaited<
  ReturnType<typeof qdrant.QdrantClient.prototype.search>
>;

export class QdrantInstrumentation extends InstrumentationBase<any> {
  protected declare _config: QdrantInstrumentationConfig;

  constructor(config: QdrantInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-qdrant", version, config);
  }

  public override setConfig(config: QdrantInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "@qdrant/js-client-rest",
      ["^1.9"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof qdrant) {
    this._diag.debug(`Manually patching Qdrant`);
    this.wrap(module);
  }

  private wrap(module: typeof qdrant) {
    this._wrap(module.QdrantClient.prototype, UPSERT, this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, RETRIEVE, this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, SEARCH, this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, DELETE, this.wrapperMethod());

    return module;
  }

  private unwrap(module: typeof qdrant) {
    this._unwrap(module.QdrantClient.prototype, UPSERT);
    this._unwrap(module.QdrantClient.prototype, RETRIEVE);
    this._unwrap(module.QdrantClient.prototype, SEARCH);
    this._unwrap(module.QdrantClient.prototype, DELETE);

    return module;
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan({
          collectionName: args[0],
          params: args.length > 1 ? args[1] : {},
          methodName: original.name,
        });
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error(`Error in Qdrant instrumentation`, e);
            }
          },
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              plugin._endSpan({ methodName: original.name, span, result });
              resolve(result);
            });
          })
          .catch((error: Error) => {
            return new Promise((_, reject) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.end();
              reject(error);
            });
          });
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }
  private _startSpan({
    collectionName,
    params,
    methodName,
  }: {
    collectionName: string;
    params: UpsertRequest | DeleteRequest | RetrieveRequest | SearchRequest;
    methodName: string;
  }): Span {
    const spanName = `qdrant.${methodName}`;
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });
    span.setAttribute(SpanAttributes.VECTOR_DB_VENDOR, "Qdrant");

    try {
      if (this._config.traceContent) {
        if (methodName === UPSERT) {
          this._setUpsertAttributes(
            span,
            collectionName,
            params as UpsertRequest,
          );
        } else if (methodName === DELETE) {
          this._setDeleteAttributes(
            span,
            collectionName,
            params as DeleteRequest,
          );
        } else if (methodName === RETRIEVE) {
          this._setRetrieveAttributes(
            span,
            collectionName,
            params as RetrieveRequest,
          );
        } else if (methodName === SEARCH) {
          this._setSearchAttributes(
            span,
            collectionName,
            params as SearchRequest,
          );
        }
      }
    } catch (e) {
      this._diag.warn(e);
      this._config.exceptionLogger?.(e);
    }

    return span;
  }

  private _endSpan({
    methodName,
    span,
    result,
  }: {
    methodName: string;
    span: Span;
    result: any;
  }) {
    try {
      if (methodName === SEARCH) {
        this._setSearchResultAttributes(span, result as SearchResponse);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }
  }

  private _setUpsertAttributes(
    span: Span,
    collectionName: string,
    params: qdrant.Schemas["PointInsertOperations"],
  ) {
    span.setAttribute("db.qdrant.upsert.collection_name", collectionName);
    if ("batch" in params) {
      span.setAttribute(
        `db.qdrant.upsert.points_count`,
        params.batch.ids.length,
      );
    } else {
      span.setAttribute(
        `db.qdrant.upsert.points_count`,
        params.points.length,
      );
    }
  }

  private _setDeleteAttributes(
    span: Span,
    collectionName: string,
    params: qdrant.Schemas["PointsSelector"],
  ) {
    span.setAttribute("db.qdrant.delete.collection_name", collectionName);
    if ("filter" in params) {
      span.setAttribute(
        "db.qdrant.delete.filter.must",
        JSON.stringify(params.filter?.must),
      );

      span.setAttribute(
        "db.qdrant.delete.filter.should",
        JSON.stringify(params.filter?.should),
      );

      span.setAttribute(
        "db.qdrant.delete.filter.must_not",
        JSON.stringify(params.filter?.must_not),
      );

      span.setAttribute(
        "db.qdrant.delete.filter.min_should",
        JSON.stringify(params.filter?.min_should),
      );
    } else {
      span.setAttribute(
        "db.qdrant.delete.point_ids",
        JSON.stringify(params.points),
      );
      span.setAttribute(
        "db.qdrant.delete.ids_count",
        params.points.length,
      );
    }
  }

  private _setRetrieveAttributes(
    span: Span,
    collectionName: string,
    params: qdrant.Schemas["PointRequest"],
  ) {
    span.setAttribute("db.qdrant.retrieve.collection_name", collectionName);
    span.setAttribute(
      "db.qdrant.retrieve.point_ids",
      JSON.stringify(params.ids)
    );
    span.setAttribute(
      "db.qdrant.retrieve.ids_count",
      params.ids.length,
    );
    span.setAttribute(
      "db.qdrant.retrieve.with_payload",
      !!params.with_payload,
    );
    span.setAttribute(
      "db.qdrant.retrieve.with_vector",
      !!params.with_vector,
    );
  }

  private _setSearchAttributes(
    span: Span,
    collectionName: string,
    params: qdrant.Schemas["SearchRequest"],
  ) {
    span.setAttribute("db.qdrant.search.collection_name", collectionName);
    const query_request_event = span.addEvent("qdrant.search.request");
    query_request_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_TOP_K,
      params.limit,
    );
    query_request_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_INCLUDE_VALUES,
      !!params.with_vector,
    );
    query_request_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_INCLUDE_METADATA,
      !!params.with_payload,
    );
    query_request_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_EMBEDDINGS_VECTOR,
      JSON.stringify(params.vector),
    );
    query_request_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_METADATA_FILTER,
      JSON.stringify(params.filter ?? {}),
    );
  }

  private _setSearchResultAttributes(span: Span, result: SearchResponse) {
    const qdrant_result_event = span.addEvent("qdrant.search.result");

    qdrant_result_event.setAttribute(
      EventAttributes.VECTOR_DB_QUERY_RESULT_MATCHES_LENGTH,
      result.length,
    );

    for (let i = 0; i < result.length; i++) {
      const match = result[i];
      const search_result_match_event = qdrant_result_event.addEvent(
        `qdrant.search.result.${i}`,
      );
      search_result_match_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_RESULT_SCORE.replace(
          "{i}",
          i.toString(),
        ),
        match.score,
      );
      search_result_match_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_RESULT_ID.replace("{i}", i.toString()),
        match.id,
      );
      search_result_match_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_RESULT_VALUES.replace(
          "{i}",
          i.toString(),
        ),
        JSON.stringify(match.vector),
      );
      search_result_match_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_RESULT_METADATA.replace(
          "{i}",
          i.toString(),
        ),
        JSON.stringify(match.payload),
      );
    }
  }
}
