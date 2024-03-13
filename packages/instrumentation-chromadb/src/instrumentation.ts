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
  Attributes,
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
import { ChromaDBInstrumentationConfig } from "./types";
import * as chromadb from "chromadb";
import {
  SpanAttributes,
  EventAttributes,
} from "@traceloop/ai-semantic-conventions";

export class ChromaDBInstrumentation extends InstrumentationBase<any> {
  protected override _config!: ChromaDBInstrumentationConfig;

  constructor(config: ChromaDBInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-chromadb", "0.3.11", config);
  }

  public override setConfig(config: ChromaDBInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "chromadb",
      ["^1.8.1"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof chromadb) {
    return module;
  }

  private wrap(module: typeof chromadb) {
    this._wrap(module.Collection.prototype, "add", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "get", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "query", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "update", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "upsert", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "peek", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "delete", this.wrapperMethod());
    this._wrap(module.Collection.prototype, "modify", this.wrapperMethod());

    return module;
  }

  private unwrap(module: typeof chromadb) {
    this._unwrap(module.Collection.prototype, "add");
    this._unwrap(module.Collection.prototype, "get");
    this._unwrap(module.Collection.prototype, "query");
    this._unwrap(module.Collection.prototype, "update");
    this._unwrap(module.Collection.prototype, "upsert");
    this._unwrap(module.Collection.prototype, "peek");
    this._unwrap(module.Collection.prototype, "delete");
    this._unwrap(module.Collection.prototype, "modify");

    return module;
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan({
          params: args[0],
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
        const awaitedResult = (await result) as
          | chromadb.GetResponse
          | chromadb.QueryResponse;

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
    params,
    methodName,
  }: {
    params: chromadb.GetParams | chromadb.PeekParams;
    methodName: string;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.VECTOR_DB_VENDOR]: "ChromaDB",
    };
    const span = this.tracer.startSpan(`chromadb.${methodName}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });

    // Instrumenting only for query and peak
    if (methodName === "query" || methodName === "pek") {
      const query_request_event = span.addEvent("chromadb.query.request");
      query_request_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_INCLUDE_VALUES,
        JSON.stringify(params),
      );
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
    result: chromadb.GetResponse | chromadb.QueryResponse;
  }): void {
    // Instrumenting only for query and peak
    if (methodName === "query" || methodName === "peek") {
      const query_result_event = span.addEvent("chromadb.query.result");
      query_result_event.setAttribute(
        EventAttributes.VECTOR_DB_QUERY_RESULT_VALUES,
        JSON.stringify(result),
      );
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}
