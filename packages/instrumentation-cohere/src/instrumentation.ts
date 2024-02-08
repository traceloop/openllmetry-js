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
import { Stream } from "cohere-ai/core";

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

    return module;
  }

  private unwrap(module: typeof cohere) {
    // this._unwrap(module.CohereClient.prototype, "generate");
    this._unwrap(module.CohereClient.prototype, "generateStream");
    this._unwrap(module.CohereClient.prototype, "chat");
    this._unwrap(module.CohereClient.prototype, "chatStream");
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
          | cohere.Cohere.StreamedChatResponse;

        await this._endSpan({
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

    attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
    attributes[SpanAttributes.LLM_TOP_P] = params.p;
    attributes[SpanAttributes.LLM_TOP_K] = params.k;
    attributes[SpanAttributes.LLM_TEMPERATURE] = params.temperature;
    attributes[SpanAttributes.LLM_FREQUENCY_PENALTY] = params.frequencyPenalty;
    attributes[SpanAttributes.LLM_PRESENCE_PENALTY] = params.presencePenalty;
    attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] = params.maxTokens;

    if (this._shouldSendPrompts()) {
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
      if ("prompt" in params)
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`] = params.prompt;
      else if ("message" in params)
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`] = params.message;
    }

    return this.tracer.startSpan(`cohere.${methodName}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private async _endSpan({
    span,
    result,
  }: {
    span: Span;
    result:
      | cohere.Cohere.Generation
      | cohere.Cohere.GenerateStreamedResponse
      | cohere.Cohere.NonStreamedChatResponse
      | cohere.Cohere.StreamedChatResponse;
  }) {
    if ("meta" in result) {
      if (typeof result.meta?.billedUnits?.inputTokens === "number") {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          result.meta?.billedUnits?.inputTokens,
        );
      }

      if (typeof result.meta?.billedUnits?.outputTokens === "number") {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.meta?.billedUnits?.outputTokens,
        );
      }

      if (
        typeof result.meta?.billedUnits?.inputTokens === "number" &&
        typeof result.meta?.billedUnits?.outputTokens === "number"
      ) {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.meta?.billedUnits?.inputTokens +
            result.meta?.billedUnits?.outputTokens,
        );
      }
    }

    if (this._shouldSendPrompts()) {
      if ("generations" in result) {
        this._setResponseSpanForGenerate(span, result);
      } else if (result instanceof Stream) {
        for await (const message of result) {
          if (message.eventType === "stream-end") {
            this._setResponseSpanForGenerate(span, message.response);
          }
        }
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _setResponseSpanForGenerate(
    span: Span,
    result: cohere.Cohere.Generation,
  ) {
    if ("meta" in result) {
      if (typeof result.meta?.billedUnits?.inputTokens === "number") {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          result.meta?.billedUnits?.inputTokens,
        );
      }

      if (typeof result.meta?.billedUnits?.outputTokens === "number") {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.meta?.billedUnits?.outputTokens,
        );
      }

      if (
        typeof result.meta?.billedUnits?.inputTokens === "number" &&
        typeof result.meta?.billedUnits?.outputTokens === "number"
      ) {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.meta?.billedUnits?.inputTokens +
            result.meta?.billedUnits?.outputTokens,
        );
      }
    }

    span.setAttribute(`${SpanAttributes.LLM_COMPLETIONS}.0.role`, "assistant");
    span.setAttribute(
      `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
      result.generations[0].text,
    );

    if (
      "finish_reason" in result.generations[0] &&
      typeof result.generations[0].finish_reason === "string"
    )
      span.setAttribute(
        `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
        result.generations[0].finish_reason,
      );

    if (
      "finishReason" in result.generations[0] &&
      typeof result.generations[0].finishReason === "string"
    )
      span.setAttribute(
        `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
        result.generations[0].finishReason,
      );
  }

  private _getLlmRequestTypeByMethod(methodName: string) {
    if (methodName === "chat") return LLMRequestTypeValues.CHAT;
    else if (methodName === "generate") return LLMRequestTypeValues.COMPLETION;
    else return LLMRequestTypeValues.UNKNOWN;
  }

  private _shouldSendPrompts() {
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
