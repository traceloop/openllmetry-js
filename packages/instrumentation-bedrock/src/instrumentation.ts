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
// import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";
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
import { BedrockInstrumentationConfig } from "./types";
import * as bedrock from "@aws-sdk/client-bedrock-runtime";

export class BedrockInstrumentation extends InstrumentationBase<any> {
  protected override _config!: BedrockInstrumentationConfig;

  constructor(config: BedrockInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-bedrock", "0.0.17", config);
  }

  public override setConfig(config: BedrockInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "@aws-sdk/client-bedrock-runtime",
      [">=3.499.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    console.log(">>> init done");
    return module;
  }

  public manuallyInstrument(module: typeof bedrock) {
    console.log(">>> manualinstrument");
    this._wrap(
      module.BedrockRuntime.prototype,
      "invokeModel",
      this.wrapperMethod(),
    );
  }

  private wrap(module: typeof bedrock) {
    console.log(">>> wrap");
    this._wrap(
      module.BedrockRuntime.prototype,
      "invokeModel",
      this.wrapperMethod(),
    );
    console.log(">>> wrap after");
  }

  private unwrap(module: typeof bedrock) {
    console.log(">>> unwrap");
    this._unwrap(module.BedrockRuntime.prototype, "invokeModel");
    console.log(">>> unwrap after");
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: any) => {
      return function method(
        this: any,
        ...args: any
        // | [
        //       args: bedrock.InvokeModelCommandInput,
        //       options?: __HttpHandlerOptions | undefined,
        //     ]
        //   | [
        //       args: bedrock.InvokeModelCommandInput,
        //       cb: (
        //         err: any,
        //         data?: bedrock.InvokeModelCommandOutput | undefined,
        //       ) => void,
        //     ]
        //   | [
        //       args: bedrock.InvokeModelCommandInput,
        //       options: __HttpHandlerOptions,
        //       cb: (
        //         err: any,
        //         data?: bedrock.InvokeModelCommandOutput | undefined,
        //       ) => void,
        //     ]
      ) {
        console.log(">>> args", args[0]);
        const span = plugin._startSpan({
          params: args[0],
        });
        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          () => {},
        ) as Promise<bedrock.InvokeModelCommandOutput>;
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }
  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    console.log(">>> into _wrapPromise");
    return promise
      .then(async (result) => {
        console.log(">>> into result", result);
        return new Promise<T>((resolve) => {
          this._endSpan({
            span,
            result: result as bedrock.InvokeModelCommandOutput,
          });
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
          span.end();

          reject(error);
        });
      });
  }

  private _startSpan({
    params,
  }: {
    params: bedrock.InvokeModelCommandInput;
  }): Span {
    console.log(">>> params", params);
    return this.tracer.startSpan(`bedrock.completion`, {
      kind: SpanKind.CLIENT,
    });
  }

  private async _endSpan({
    span,
    result,
  }: {
    span: Span;
    result: bedrock.InvokeModelCommandOutput;
  }) {
    console.log(">>> result", span, result);
  }
}
