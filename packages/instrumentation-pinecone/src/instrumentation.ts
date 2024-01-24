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
import type * as pinecone from "@pinecone-database/pinecone";

import { context, trace, Tracer, SpanStatusCode } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

export class PineconeInstrumentation extends InstrumentationBase<any> {
  constructor(config: InstrumentationConfig = {}) {
    super("@traceloop/instrumentation-pinecone", "0.0.17", config);
  }

  public manuallyInstrument(
    module: typeof pinecone & { openLLMetryPatched?: boolean },
  ) {
    if (module.openLLMetryPatched) {
      return;
    }
    this._wrap(
      module.Index.prototype,
      "query",
      this.genericWrapper("query", this.tracer),
    );
    this._wrap(
      module.Index.prototype,
      "upsert",
      this.genericWrapper("upsert", this.tracer),
    );
    this._wrap(
      module.Index.prototype,
      "deleteAll",
      this.genericWrapper("delete", this.tracer),
    );
    this._wrap(
      module.Index.prototype,
      "deleteMany",
      this.genericWrapper("delete", this.tracer),
    );
    this._wrap(
      module.Index.prototype,
      "deleteOne",
      this.genericWrapper("delete", this.tracer),
    );
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "pinecone",
      [">=2.0.1"], // TODO: Figure out version here.
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(
    moduleExports: typeof pinecone & { openLLMetryPatched?: boolean },
  ) {
    if (moduleExports.openLLMetryPatched) {
      return moduleExports;
    }
    this._wrap(
      moduleExports.Index.prototype,
      "query",
      this.genericWrapper("query", this.tracer),
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
}
