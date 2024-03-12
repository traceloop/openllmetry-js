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
import * as pinecone from "@pinecone-database/pinecone";

import { context, trace, Tracer, SpanStatusCode } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import {
  SpanAttributes,
  EventAttributes,
} from "@traceloop/ai-semantic-conventions";

export class PineconeInstrumentation extends InstrumentationBase<any> {
  constructor(config: InstrumentationConfig = {}) {
    super("@traceloop/instrumentation-pinecone", "0.3.0", config);
  }

  public manuallyInstrument(module: typeof pinecone) {
    this.patch(module);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "@pinecone-database/pinecone",
      [">=2.0.1"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof pinecone) {
    this._wrap(
      moduleExports.Index.prototype,
      "query",
      this.queryWrapper(this.tracer),
    );
    this._wrap(
      moduleExports.Index.prototype,
      "upsert",
      this.genericWrapper("upsert", this.tracer),
    );
    this._wrap(
      moduleExports.Index.prototype,
      "deleteAll",
      this.genericWrapper("delete", this.tracer),
    );
    this._wrap(
      moduleExports.Index.prototype,
      "deleteMany",
      this.genericWrapper("delete", this.tracer),
    );
    this._wrap(
      moduleExports.Index.prototype,
      "deleteOne",
      this.genericWrapper("delete", this.tracer),
    );

    return moduleExports;
  }

  private unpatch(moduleExports: typeof pinecone): void {
    this._unwrap(moduleExports.Index.prototype, "query");
    this._unwrap(moduleExports.Index.prototype, "upsert");
    this._unwrap(moduleExports.Index.prototype, "deleteAll");
    this._unwrap(moduleExports.Index.prototype, "deleteMany");
    this._unwrap(moduleExports.Index.prototype, "deleteOne");
  }

  private genericWrapper(methodName: string, tracer: Tracer) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const span = tracer.startSpan(`pinecone.${methodName}`);
        span.setAttribute(SpanAttributes.VECTOR_DB_VENDOR, "Pinecone");
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {},
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
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

  private queryWrapper(tracer: Tracer) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const span = tracer.startSpan(`pinecone.query`);
        const execContext = trace.setSpan(context.active(), span);
        const options = args[0] as pinecone.QueryOptions;
        span.setAttribute(SpanAttributes.VECTOR_DB_VENDOR, "Pinecone");
        const query_request_event = span.addEvent("pinecone.query.request");
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_TOP_K,
          options.topK,
        );
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_INCLUDE_VALUES,
          options.includeValues || false,
        );
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_INCLUDE_METADATA,
          options.includeMetadata || false,
        );
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_ID,
          (options as pinecone.QueryByRecordId).id,
        );
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_EMBEDDINGS_VECTOR,
          (options as pinecone.QueryByVectorValues).vector,
        );
        query_request_event.setAttribute(
          EventAttributes.VECTOR_DB_QUERY_METADATA_FILTER,
          JSON.stringify(options.filter ? options.filter : {}),
        );

        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {},
        );
        const wrappedPromise = execPromise
          .then((result: any) => {
            return new Promise((resolve) => {
              span.setStatus({ code: SpanStatusCode.OK });
              const result_obj =
                result as pinecone.QueryResponse<pinecone.RecordMetadata>;
              const query_result_event = span.addEvent("pinecone.query.result");
              query_result_event.setAttribute(
                EventAttributes.VECTOR_DB_QUERY_RESULT_NAMESPACE,
                result_obj.namespace,
              );
              if (result_obj.usage?.readUnits !== undefined) {
                query_result_event.setAttribute(
                  EventAttributes.VECTOR_DB_QUERY_RESULT_READ_UNITS_CONSUMED,
                  result_obj.usage?.readUnits,
                );
              }
              query_result_event.setAttribute(
                EventAttributes.VECTOR_DB_QUERY_RESULT_MATCHES_LENGTH,
                result_obj.matches.length,
              );
              for (let i = 0; i < result_obj.matches.length; i++) {
                const match = result_obj.matches[i];
                const query_result_match_event = query_result_event.addEvent(
                  `pinecone.query.result.${i}`,
                );
                if (match.score !== undefined) {
                  query_result_match_event.setAttribute(
                    EventAttributes.VECTOR_DB_QUERY_RESULT_SCORE.replace(
                      "{i}",
                      i.toString(),
                    ),
                    match.score,
                  );
                }
                if (match.sparseValues !== undefined) {
                  query_result_match_event.setAttribute(
                    EventAttributes.VECTOR_DB_QUERY_RESULT_SPARSE_INDICES.replace(
                      "{i}",
                      i.toString(),
                    ),
                    match.sparseValues?.indices,
                  );
                  query_result_match_event.setAttribute(
                    EventAttributes.VECTOR_DB_QUERY_RESULT_SPARSE_VALUES.replace(
                      "{i}",
                      i.toString(),
                    ),
                    match.sparseValues?.values,
                  );
                }
                query_result_match_event.setAttribute(
                  EventAttributes.VECTOR_DB_QUERY_RESULT_ID.replace(
                    "{i}",
                    i.toString(),
                  ),
                  match.id,
                );
                query_result_match_event.setAttribute(
                  EventAttributes.VECTOR_DB_QUERY_RESULT_VALUES.replace(
                    "{i}",
                    i.toString(),
                  ),
                  match.values,
                );
                query_result_match_event.addEvent(
                  `pinecone.query.result.${i}.metadata`,
                  match.metadata,
                );
              }
              span.end();
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
}
