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
  Attributes,
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
import { CohereInstrumentationConfig } from "./types";
import * as cohere from "cohere-ai";
import {
  LLMRequestTypeValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

export class CohereInstrumentation extends InstrumentationBase<any> {
  protected override _config!: CohereInstrumentationConfig;

  constructor(config: CohereInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-cohere", "0.3.0", config);
  }

  public override setConfig(config: CohereInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "cohere-ai",
      [">=7.7.5"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof cohere) {
    this._wrap(module.CohereClient.prototype, "generate", this.wrapperMethod());
    this._wrap(
      module.CohereClient.prototype,
      "generateStream",
      this.wrapperMethod(),
    );
    this._wrap(module.CohereClient.prototype, "chat", this.wrapperMethod());
    this._wrap(
      module.CohereClient.prototype,
      "chatStream",
      this.wrapperMethod(),
    );
    this._wrap(module.CohereClient.prototype, "rerank", this.wrapperMethod());

    return module;
  }

  private wrap(module: typeof cohere) {
    this._wrap(module.CohereClient.prototype, "generate", this.wrapperMethod());
    this._wrap(
      module.CohereClient.prototype,
      "generateStream",
      this.wrapperMethod(),
    );
    this._wrap(module.CohereClient.prototype, "chat", this.wrapperMethod());
    this._wrap(
      module.CohereClient.prototype,
      "chatStream",
      this.wrapperMethod(),
    );
    this._wrap(module.CohereClient.prototype, "rerank", this.wrapperMethod());

    return module;
  }

  private unwrap(module: typeof cohere) {
    // this._unwrap(module.CohereClient.prototype, "generate");
    this._unwrap(module.CohereClient.prototype, "generateStream");
    this._unwrap(module.CohereClient.prototype, "chat");
    this._unwrap(module.CohereClient.prototype, "chatStream");
    this._unwrap(module.CohereClient.prototype, "rerank");
  }

  private wrapperMethod(): any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan({
          params: args[0],
          methodName:
            Object.getOwnPropertyDescriptors(original).name.value ?? "",
        });
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
        return context.bind(execContext, wrappedPromise);
      };
    };
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then(async (result) => {
        const awaitedResult = (await result) as
          | cohere.Cohere.Generation
          | cohere.Cohere.GenerateStreamedResponse
          | cohere.Cohere.NonStreamedChatResponse
          | cohere.Cohere.StreamedChatResponse
          | cohere.Cohere.RerankResponse;

        this._endSpan({
          span,
          result: awaitedResult,
        });

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

  private _startSpan({
    params,
    methodName,
  }: {
    params:
      | cohere.Cohere.GenerateRequest
      | cohere.Cohere.GenerateStreamRequest
      | cohere.Cohere.ChatRequest
      | cohere.Cohere.ChatStreamRequest;
    methodName: string;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_VENDOR]: "Cohere",
      [SpanAttributes.LLM_REQUEST_TYPE]:
        this._getLlmRequestTypeByMethod(methodName),
    };

    return this.tracer.startSpan(`cohere.${methodName}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private _endSpan({
    span,
    result,
  }: {
    span: Span;
    result:
      | cohere.Cohere.Generation
      | cohere.Cohere.GenerateStreamedResponse
      | cohere.Cohere.NonStreamedChatResponse
      | cohere.Cohere.StreamedChatResponse
      | cohere.Cohere.RerankResponse;
  }) {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _getLlmRequestTypeByMethod(methodName: string) {
    if (methodName === "chat") return LLMRequestTypeValues.CHAT;
    else if (methodName === "generate") return LLMRequestTypeValues.COMPLETION;
    else if (methodName === "rerank") return LLMRequestTypeValues.RERANK;
    else return LLMRequestTypeValues.UNKNOWN;
  }

  private _shouldSendPrompts() {
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
