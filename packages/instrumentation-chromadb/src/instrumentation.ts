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
// import {
//   Span,
//   SpanKind,
//   Attributes,
//   SpanStatusCode,
//   context,
//   trace,
// } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  // safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { ChromaDBInstrumentationConfig } from "./types";
import type * as chromadb from "chromadb";
// import {
//   Events,
//   SpanAttributes,
//   EventAttributes,
// } from "@traceloop/ai-semantic-conventions";
import { version } from "../package.json";

export class ChromaDBInstrumentation extends InstrumentationBase {
  declare protected _config: ChromaDBInstrumentationConfig;

  constructor(config: ChromaDBInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-chromadb", version, config);
  }

  public override setConfig(config: ChromaDBInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "chromadb",
      ["^1.8.1"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof chromadb) {
    // this._diag.debug(`Manually patching chromadb`);
    // this.wrap(module);
  }

  private wrap(module: typeof chromadb) {
    // this._wrap(module.Collection.prototype, "add", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "get", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "query", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "update", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "upsert", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "peek", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "delete", this.wrapperMethod());
    // this._wrap(module.Collection.prototype, "modify", this.wrapperMethod());

    return module;
  }

  private unwrap(module: typeof chromadb) {
    // this._unwrap(module.Collection.prototype, "add");
    // this._unwrap(module.Collection.prototype, "get");
    // this._unwrap(module.Collection.prototype, "query");
    // this._unwrap(module.Collection.prototype, "update");
    // this._unwrap(module.Collection.prototype, "upsert");
    // this._unwrap(module.Collection.prototype, "peek");
    // this._unwrap(module.Collection.prototype, "delete");
    // this._unwrap(module.Collection.prototype, "modify");

    return module;
  }

  // private wrapperMethod() {
  //   // eslint-disable-next-line @typescript-eslint/no-this-alias
  //   const plugin = this;
  //   // eslint-disable-next-line
  //   return (original: Function) => {
  //     return function method(this: any, ...args: any) {
  //       const span = plugin._startSpan({
  //         params: args[0],
  //         methodName: original.name,
  //       });
  //       const execContext = trace.setSpan(context.active(), span);
  //       const execPromise = safeExecuteInTheMiddle(
  //         () => {
  //           return context.with(execContext, () => {
  //             return original.apply(this, args);
  //           });
  //         },
  //         () => null,
  //       );
  //       const wrappedPromise = plugin._wrapPromise(
  //         original.name,
  //         span,
  //         execPromise,
  //       );
  //       return context.bind(execContext, wrappedPromise as any);
  //     };
  //   };
  // }

  // private _wrapPromise<T>(
  //   methodName: string,
  //   span: Span,
  //   promise: Promise<T>,
  // ): Promise<T> {
  //   return promise
  //     .then(async (result) => {
  //       const awaitedResult = (await result) as chromadb.QueryResponse;

  //       this._endSpan({
  //         methodName,
  //         span,
  //         result: awaitedResult,
  //       });

  //       return new Promise<T>((resolve) => {
  //         resolve(result);
  //       });
  //     })
  //     .catch((error: Error) => {
  //       return new Promise<T>((_, reject) => {
  //         span.setStatus({
  //           code: SpanStatusCode.ERROR,
  //           message: error.message,
  //         });
  //         span.recordException(error);
  //         reject(error);
  //       });
  //     })
  //     .finally(() => {
  //       span.end();
  //     });
  // }

  // private _startSpan({
  //   params,
  //   methodName,
  // }: {
  //   params:
  //     | chromadb.AddParams
  //     | chromadb.DeleteParams
  //     | chromadb.GetParams
  //     | chromadb.ModifyCollectionParams
  //     | chromadb.PeekParams
  //     | chromadb.QueryParams;
  //   methodName: string;
  // }): Span {
  //   const attributes: Attributes = {
  //     [SpanAttributes.VECTOR_DB_VENDOR]: "ChromaDB",
  //   };
  //   const span = this.tracer.startSpan(`chromadb.${methodName}`, {
  //     kind: SpanKind.CLIENT,
  //     attributes,
  //   });

  //   try {
  //     if (this._config.traceContent) {
  //       if (
  //         methodName === "add" ||
  //         methodName === "update" ||
  //         methodName === "upsert"
  //       ) {
  //         this._setAddOrUpdateOrUpsertAttributes(
  //           span,
  //           params as chromadb.AddParams,
  //           methodName,
  //         );
  //       } else if (methodName === "delete") {
  //         this._setDeleteAttributes(span, params as chromadb.DeleteParams);
  //       } else if (methodName === "get") {
  //         this._setGetAttributes(span, params as chromadb.GetParams);
  //       } else if (methodName === "modify") {
  //         this._setModifyAttributes(
  //           span,
  //           params as chromadb.ModifyCollectionParams,
  //         );
  //       } else if (methodName === "peek") {
  //         this._setPeekAttributes(span, params as chromadb.PeekParams);
  //       } else if (methodName === "query") {
  //         this._setQueryAttributes(span, params as chromadb.GetParams);
  //       }
  //     }
  //   } catch (e) {
  //     this._diag.debug(e);
  //     this._config.exceptionLogger?.(e);
  //   }

  //   return span;
  // }

  // // Request attributes

  // private _setAddOrUpdateOrUpsertAttributes(
  //   span: Span,
  //   params: chromadb.AddParams,
  //   method: "add" | "update" | "upsert",
  // ) {
  //   span.setAttribute(
  //     `db.chroma.${method}.ids_count`,
  //     JSON.stringify(params.ids.length),
  //   );
  //   span.setAttribute(
  //     `db.chroma.${method}.embeddings_count`,
  //     JSON.stringify(params.embeddings?.length),
  //   );
  //   span.setAttribute(
  //     `db.chroma.${method}.metadatas_count`,
  //     JSON.stringify(params.metadatas?.length),
  //   );
  //   span.setAttribute(
  //     `db.chroma.${method}.documents_count`,
  //     JSON.stringify(params.documents?.length),
  //   );
  // }

  // private _setDeleteAttributes(span: Span, params: chromadb.DeleteParams) {
  //   span.setAttribute(
  //     "db.chroma.delete.ids_count",
  //     JSON.stringify(params.ids?.length),
  //   );
  //   span.setAttribute("db.chroma.delete.where", JSON.stringify(params.where));
  //   span.setAttribute(
  //     "db.chroma.delete.where_document",
  //     JSON.stringify(params.whereDocument),
  //   );
  // }

  // private _setGetAttributes(span: Span, params: chromadb.GetParams) {
  //   span.setAttribute(
  //     "db.chroma.get.ids_count",
  //     JSON.stringify(params.ids?.length),
  //   );
  //   span.setAttribute("db.chroma.get.where", JSON.stringify(params.where));
  //   span.setAttribute("db.chroma.get.limit", JSON.stringify(params.limit));
  //   span.setAttribute("db.chroma.get.offset", JSON.stringify(params.offset));
  //   span.setAttribute(
  //     "db.chroma.get.where_document",
  //     JSON.stringify(params.whereDocument),
  //   );
  //   span.setAttribute("db.chroma.get.include", JSON.stringify(params.include));
  // }

  // private _setModifyAttributes(
  //   span: Span,
  //   params: chromadb.ModifyCollectionParams,
  // ) {
  //   span.setAttribute("db.chroma.modify.name", JSON.stringify(params.name));
  //   span.setAttribute(
  //     "db.chroma.modify.metadata",
  //     JSON.stringify(params.metadata),
  //   );
  // }

  // private _setPeekAttributes(span: Span, params: chromadb.PeekParams) {
  //   span.setAttribute("db.chroma.peek.limit", JSON.stringify(params.limit));
  // }

  // private _setQueryAttributes(span: Span, params: chromadb.QueryParams) {
  //   span.setAttribute(
  //     "db.chroma.query.query_embeddings_count",
  //     JSON.stringify(params.queryEmbeddings?.length),
  //   );
  //   span.setAttribute(
  //     "db.chroma.query.query_texts_count",
  //     JSON.stringify(params.queryTexts?.length),
  //   );
  //   span.setAttribute(
  //     "db.chroma.query.n_results",
  //     JSON.stringify(params.nResults),
  //   );
  //   span.setAttribute("db.chroma.query.where", JSON.stringify(params.where));
  //   span.setAttribute(
  //     "db.chroma.query.where_document",
  //     JSON.stringify(params.whereDocument),
  //   );
  //   span.setAttribute(
  //     "db.chroma.query.include",
  //     JSON.stringify(params.include),
  //   );
  // }

  // private _endSpan({
  //   methodName,
  //   span,
  //   result,
  // }: {
  //   methodName: string;
  //   span: Span;
  //   result: chromadb.QueryResponse;
  // }): void {
  //   try {
  //     if (methodName === "query") {
  //       const arrLength = result.ids.length;
  //       const attributes = [];
  //       for (let index = 0; index < arrLength; index++) {
  //         attributes.push({
  //           id: result.ids?.[index] ?? [],
  //           distances: result.distances?.[index] ?? [],
  //           metadatas: result.metadatas?.[index] ?? [],
  //           documents: result.documents?.[index] ?? [],
  //           embeddings: result.embeddings?.[index] ?? [],
  //         });
  //       }

  //       attributes.map((each) => {
  //         span.addEvent(Events.DB_QUERY_RESULT, {
  //           [EventAttributes.DB_QUERY_RESULT_ID]: JSON.stringify(each.id),
  //           [EventAttributes.DB_QUERY_RESULT_METADATA]: JSON.stringify(
  //             each.metadatas,
  //           ),
  //           [EventAttributes.DB_QUERY_RESULT_DOCUMENT]: JSON.stringify(
  //             each.documents,
  //           ),
  //           [EventAttributes.DB_QUERY_RESULT_DISTANCE]: JSON.stringify(
  //             each.distances,
  //           ),
  //           [EventAttributes.DB_QUERY_RESULT_VECTOR]: JSON.stringify(
  //             each.embeddings,
  //           ),
  //         });
  //       });
  //     }
  //   } catch (e) {
  //     this._diag.debug(e);
  //     this._config.exceptionLogger?.(e);
  //   }

  //   span.setStatus({ code: SpanStatusCode.OK });
  //   span.end();
  // }
}
