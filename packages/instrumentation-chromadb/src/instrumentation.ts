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
import { Span, SpanStatusCode, context, trace } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { ChromaDBInstrumentationConfig } from "./types";
import * as chromadb from "chromadb";

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
        const span = this.tracer.startSpan(`chroma.${original.name}`);
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          () => {},
        );
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then(async (result) => {
        return new Promise<T>((resolve) => resolve(result));
      })
      .catch((error: Error) => {
        return new Promise<T>((_, reject) => {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          span.end();

          reject(error);
        });
      });
  }
}
