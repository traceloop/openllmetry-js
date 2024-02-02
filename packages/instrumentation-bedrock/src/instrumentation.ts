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
import { BedrockInstrumentationConfig } from "./types";
import * as bedrock from "@aws-sdk/client-bedrock-runtime";
import {
  LLMRequestTypeValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";

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

    return module;
  }

  public manuallyInstrument(module: typeof bedrock) {
    this._wrap(
      module.BedrockRuntimeClient.prototype,
      "send",
      this.wrapperMethod(),
    );
  }

  private wrap(module: typeof bedrock) {
    this._wrap(
      module.BedrockRuntimeClient.prototype,
      "send",
      this.wrapperMethod(),
    );

    return module;
  }

  private unwrap(module: typeof bedrock) {
    this._unwrap(module.BedrockRuntimeClient.prototype, "send");
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: any) {
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
        );
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }
  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then(async (result) => {
        return new Promise<T>((resolve) => {
          this._endSpan({
            span,
            result: result as
              | bedrock.InvokeModelCommandOutput
              | bedrock.InvokeModelWithResponseStreamCommandOutput, //ReturnType<bedrock.BedrockRuntimeClient["send"]>,
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
    params: Parameters<bedrock.BedrockRuntimeClient["send"]>[0];
  }): Span {
    console.log(">>> params", params);

    const [vendor, model] = params.input.modelId
      ? params.input.modelId.split(".")
      : ["", ""];

    const attributes: Attributes = {
      [SpanAttributes.LLM_VENDOR]: vendor,
      [SpanAttributes.LLM_REQUEST_MODEL]: model,
      [SpanAttributes.LLM_RESPONSE_MODEL]: model,
      [SpanAttributes.LLM_REQUEST_TYPE]: LLMRequestTypeValues.COMPLETION,
    };

    if (typeof params.input.body === "string") {
      const requestBody = JSON.parse(params.input.body);

      if (vendor === "anthropic") {
        attributes[SpanAttributes.LLM_TOP_P] = requestBody["top_p"];
        attributes[SpanAttributes.LLM_TEMPERATURE] = requestBody["temperature"];
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
          requestBody["max_tokens_to_sample"];

        if (this._shouldSendPrompts()) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
            requestBody.prompt;
        }
      }
    }

    console.log(">>> attributes", attributes);

    return this.tracer.startSpan(`bedrock.completion`, {
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
      | bedrock.InvokeModelCommandOutput
      | bedrock.InvokeModelWithResponseStreamCommandOutput;
  }) {
    console.log(">>> result", result);
    if ("body" in result) {
      const attributes =
        "attributes" in span ? (span["attributes"] as Record<string, any>) : {};

      if (
        SpanAttributes.LLM_VENDOR in attributes &&
        this._shouldSendPrompts()
      ) {
        bedrock.ResponseStream;
        if (!(result.body instanceof Object.getPrototypeOf(Uint8Array))) {
          const rawRes = result.body as AsyncIterable<bedrock.ResponseStream>;
          let counter = 0;
          for await (const value of rawRes) {
            // Convert it to a JSON String
            const jsonString = new TextDecoder().decode(value.chunk?.bytes);
            // Parse the JSON string
            const parsedResponse = JSON.parse(jsonString);

            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${counter}.finish_reason`,
              parsedResponse["stop_reason"],
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${counter}.role`,
              "assistant",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${counter}.content`,
              parsedResponse["completion"],
            );

            counter += 1;
          }
        } else if (typeof result.body === "function") {
          // Convert it to a JSON String
          const jsonString = new TextDecoder().decode(result.body);
          // Parse the JSON string
          const parsedResponse = JSON.parse(jsonString);

          if (attributes[SpanAttributes.LLM_VENDOR] === "anthropic") {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
              parsedResponse["stop_reason"],
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
              "assistant",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
              parsedResponse["completion"],
            );
          }
        }
      }
    }

    console.log(">>> span", span);

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _shouldSendPrompts() {
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
