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
import * as qdrant from "@qdrant/js-client-rest";
import { version } from "../package.json";

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
    this._wrap(module.QdrantClient.prototype, "upsert", this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, "retrieve", this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, "search", this.wrapperMethod());
    this._wrap(module.QdrantClient.prototype, "delete", this.wrapperMethod());

    return module;
  }

  private unwrap(module: typeof qdrant) {
    this._unwrap(module.QdrantClient.prototype, "upsert");
    this._unwrap(module.QdrantClient.prototype, "retrieve");
    this._unwrap(module.QdrantClient.prototype, "search");
    this._unwrap(module.QdrantClient.prototype, "delete");

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
          () => null,
        );
        const wrappedPromise = plugin._wrapPromise(
          original.name,
          span,
          execPromise,
        );
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _wrapPromise<T>(
    methodName: string,
    span: Span,
    promise: Promise<T>,
  ): Promise<T> {
    return promise
      .then(async (result) => {

        const awaitedResult = (await result);

        this._endSpan({
          methodName,
          span,
          result: awaitedResult,
        });

        return new Promise<T>((resolve) => {
          resolve(result);
        });
      })
      .catch((error: Error) => {
        return new Promise<T>((_, reject) => {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          reject(error);
        });
      })
      .finally(() => {
        span.end();
      });
  }

  private _startSpan({
    collectionName,
    params,
    methodName,
  }: {
    collectionName: string;
    params:
    | qdrant.Schemas["PointInsertOperations"]
    | qdrant.Schemas["PointsSelector"]
    | qdrant.Schemas["PointRequest"]
    | qdrant.Schemas['SearchRequest']

    methodName: string;
  }): Span {
    const span = this.tracer.startSpan(`qdrant.${collectionName}.${methodName}`, {
      kind: SpanKind.CLIENT
    });

    try {
      if (this._config.traceContent) {
        if (methodName === "upsert") {
          this._setUpsertAttributes(
            span,
            params as qdrant.Schemas["PointInsertOperations"],
            methodName,
          );
        }
        else if (methodName === "delete") {
          this._setDeleteAttributes(span, params as qdrant.Schemas["PointsSelector"]);
        }
        else if (methodName === "retrieve") {
          this._setRetrieveAttributes(span, params as qdrant.Schemas["PointRequest"]);
        }

        else if (methodName === "search") {
          this._setSearchAttributes(span, params as qdrant.Schemas["SearchRequest"]);
        }
      }
    } catch (e) {
      this._diag.warn(e);
      this._config.exceptionLogger?.(e);
    }

    return span;
  }


  private _setUpsertAttributes(
    span: Span,
    params: qdrant.Schemas["PointInsertOperations"],
    method: "add" | "update" | "upsert",
  ) {

    if ("batch" in params) {
      span.setAttribute(
        `db.qdrant.${method}.points_count`,
        JSON.stringify(params.batch.ids?.length),
      );
    }

    else {
      span.setAttribute(
        `db.qdrant.${method}.points_count`,
        JSON.stringify(params.points?.length),
      );
    }
  }

  private _setDeleteAttributes(span: Span, params: qdrant.Schemas["PointsSelector"]) {
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
    }

    else {
      span.setAttribute(
        "db.qdrant.delete.point_ids",
        JSON.stringify(params.points),
      );
    }
  }

  private _setRetrieveAttributes(span: Span, params: qdrant.Schemas["PointRequest"]) {
    span.setAttribute(
      "db.qdrant.retrieve.ids_count",
      JSON.stringify(params.ids?.length),
    );
    span.setAttribute("db.qdrant.retrieve.with_payload", JSON.stringify(params.with_payload));
    span.setAttribute("db.qdrant.retrieve.with_vector", JSON.stringify(params.with_vector));
  }

  private _setSearchAttributes(span: Span, params: qdrant.Schemas["SearchRequest"]) {
    span.setAttribute(
      "db.qdrant.search.query_vector",
      JSON.stringify(params.vector),
    );
    span.setAttribute(
      "db.qdrant.search.limit",
      JSON.stringify(params.limit),
    );
    span.setAttribute(
      "db.qdrant.search.offset",
      JSON.stringify(params.offset),
    );
    span.setAttribute(
      "db.qdrant.search.score_threshold",
      JSON.stringify(params.score_threshold),
    );

    span.setAttribute("db.qdrant.search.filter",
      JSON.stringify(params.filter),
    );
  }

  private _endSpan({
    methodName,
    span,
    result,
  }: {
    methodName: string;
    span: Span;
    result: any;
  }): void {
    try {
      // Pass
    } catch (e) {
      this._diag.warn(e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}
