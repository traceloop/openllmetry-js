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
import type * as bedrock from "@aws-sdk/client-bedrock-runtime";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  LLMRequestTypeValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import { version } from "../package.json";

export class BedrockInstrumentation extends InstrumentationBase {
  declare protected _config: BedrockInstrumentationConfig;

  constructor(config: BedrockInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-bedrock", version, config);
  }

  public override setConfig(config: BedrockInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "@aws-sdk/client-bedrock-runtime",
      [">=3.499.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof bedrock) {
    this._diag.debug(`Patching @aws-sdk/client-bedrock-runtime manually`);

    this._wrap(
      module.BedrockRuntimeClient.prototype,
      "send",
      this.wrapperMethod(),
    );
  }

  private wrap(module: typeof bedrock, moduleVersion?: string) {
    this._diag.debug(
      `Patching @aws-sdk/client-bedrock-runtime@${moduleVersion}`,
    );

    this._wrap(
      module.BedrockRuntimeClient.prototype,
      "send",
      this.wrapperMethod(),
    );

    return module;
  }

  private unwrap(module: typeof bedrock, moduleVersion?: string) {
    this._diag.debug(
      `Unpatching @aws-sdk/client-bedrock-runtime@${moduleVersion}`,
    );

    this._unwrap(module.BedrockRuntimeClient.prototype, "send");
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
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
          (e) => {
            if (e) {
              plugin._diag.error(`Error in bedrock instrumentation`, e);
            }
          },
        );
        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }
  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then(async (result) => {
        await this._endSpan({
          span,
          result: result as
            | bedrock.InvokeModelCommandOutput
            | bedrock.InvokeModelWithResponseStreamCommandOutput,
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
  }: {
    params: Parameters<bedrock.BedrockRuntimeClient["send"]>[0];
  }): Span {
    let attributes: Attributes = {};

    try {
      const input = params.input as bedrock.InvokeModelCommandInput;
      const [vendor, model] = input.modelId
        ? input.modelId.split(".")
        : ["", ""];

      attributes = {
        [SpanAttributes.LLM_SYSTEM]: vendor,
        [SpanAttributes.LLM_REQUEST_MODEL]: model,
        [SpanAttributes.LLM_RESPONSE_MODEL]: model,
        [SpanAttributes.LLM_REQUEST_TYPE]: LLMRequestTypeValues.COMPLETION,
      };

      if (typeof input.body === "string") {
        const requestBody = JSON.parse(input.body);

        attributes = {
          ...attributes,
          ...this._setRequestAttributes(vendor, requestBody),
        };
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

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
    try {
      if ("body" in result) {
        const attributes =
          "attributes" in span
            ? (span["attributes"] as Record<string, any>)
            : {};

        if (SpanAttributes.LLM_SYSTEM in attributes) {
          if (!(result.body instanceof Object.getPrototypeOf(Uint8Array))) {
            const rawRes = result.body as AsyncIterable<bedrock.ResponseStream>;

            let streamedContent = "";
            for await (const value of rawRes) {
              // Convert it to a JSON String
              const jsonString = new TextDecoder().decode(value.chunk?.bytes);
              // Parse the JSON string
              const parsedResponse = JSON.parse(jsonString);

              if ("amazon-bedrock-invocationMetrics" in parsedResponse) {
                span.setAttribute(
                  SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "inputTokenCount"
                  ],
                );
                span.setAttribute(
                  SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "outputTokenCount"
                  ],
                );

                span.setAttribute(
                  SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "inputTokenCount"
                  ] +
                    parsedResponse["amazon-bedrock-invocationMetrics"][
                      "outputTokenCount"
                    ],
                );
              }

              let responseAttributes = this._setResponseAttributes(
                attributes[SpanAttributes.LLM_SYSTEM],
                parsedResponse,
                true,
              );

              // ! NOTE: This make sure the content always have all streamed chunks
              if (this._shouldSendPrompts()) {
                // Update local value with attribute value that was set by _setResponseAttributes
                streamedContent +=
                  responseAttributes[
                    `${SpanAttributes.LLM_COMPLETIONS}.0.content`
                  ];
                // re-assign the new value to responseAttributes
                responseAttributes = {
                  ...responseAttributes,
                  [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]:
                    streamedContent,
                };
              }

              span.setAttributes(responseAttributes);
            }
          } else if (result.body instanceof Object.getPrototypeOf(Uint8Array)) {
            // Convert it to a JSON String
            const jsonString = new TextDecoder().decode(
              result.body as Uint8Array,
            );
            // Parse the JSON string
            const parsedResponse = JSON.parse(jsonString);

            const responseAttributes = this._setResponseAttributes(
              attributes[SpanAttributes.LLM_SYSTEM],
              parsedResponse,
            );

            span.setAttributes(responseAttributes);
          }
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _setRequestAttributes(
    vendor: string,
    requestBody: Record<string, any>,
  ) {
    switch (vendor) {
      case "ai21": {
        return {
          [SpanAttributes.LLM_REQUEST_TOP_P]: requestBody["topP"],
          [SpanAttributes.LLM_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [SpanAttributes.LLM_REQUEST_MAX_TOKENS]: requestBody["maxTokens"],
          [SpanAttributes.LLM_PRESENCE_PENALTY]:
            requestBody["presencePenalty"]["scale"],
          [SpanAttributes.LLM_FREQUENCY_PENALTY]:
            requestBody["frequencyPenalty"]["scale"],

          // Prompt & Role
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_PROMPTS}.0.role`]: "user",
                [`${SpanAttributes.LLM_PROMPTS}.0.content`]:
                  requestBody["prompt"],
              }
            : {}),
        };
      }
      case "amazon": {
        return {
          [SpanAttributes.LLM_REQUEST_TOP_P]:
            requestBody["textGenerationConfig"]["topP"],
          [SpanAttributes.LLM_REQUEST_TEMPERATURE]:
            requestBody["textGenerationConfig"]["temperature"],
          [SpanAttributes.LLM_REQUEST_MAX_TOKENS]:
            requestBody["textGenerationConfig"]["maxTokenCount"],

          // Prompt & Role
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_PROMPTS}.0.role`]: "user",
                [`${SpanAttributes.LLM_PROMPTS}.0.content`]:
                  requestBody["inputText"],
              }
            : {}),
        };
      }
      case "anthropic": {
        return {
          [SpanAttributes.LLM_REQUEST_TOP_P]: requestBody["top_p"],
          [SpanAttributes.LLM_TOP_K]: requestBody["top_k"],
          [SpanAttributes.LLM_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [SpanAttributes.LLM_REQUEST_MAX_TOKENS]:
            requestBody["max_tokens_to_sample"],

          // Prompt & Role
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_PROMPTS}.0.role`]: "user",
                [`${SpanAttributes.LLM_PROMPTS}.0.content`]: requestBody[
                  "prompt"
                ]
                  // The format is removing when we are setting span attribute
                  .replace("\n\nHuman:", "")
                  .replace("\n\nAssistant:", ""),
              }
            : {}),
        };
      }
      case "cohere": {
        return {
          [SpanAttributes.LLM_REQUEST_TOP_P]: requestBody["p"],
          [SpanAttributes.LLM_TOP_K]: requestBody["k"],
          [SpanAttributes.LLM_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [SpanAttributes.LLM_REQUEST_MAX_TOKENS]: requestBody["max_tokens"],

          // Prompt & Role
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_PROMPTS}.0.role`]: "user",
                [`${SpanAttributes.LLM_PROMPTS}.0.content`]:
                  requestBody["prompt"],
              }
            : {}),
        };
      }
      case "meta": {
        return {
          [SpanAttributes.LLM_REQUEST_TOP_P]: requestBody["top_p"],
          [SpanAttributes.LLM_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [SpanAttributes.LLM_REQUEST_MAX_TOKENS]: requestBody["max_gen_len"],

          // Prompt & Role
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_PROMPTS}.0.role`]: "user",
                [`${SpanAttributes.LLM_PROMPTS}.0.content`]:
                  requestBody["prompt"],
              }
            : {}),
        };
      }
      default:
        return {};
    }
  }

  private _setResponseAttributes(
    vendor: string,
    response: Record<string, any>,
    isStream = false,
  ) {
    switch (vendor) {
      case "ai21": {
        return {
          [`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`]:
            response["completions"][0]["finishReason"]["reason"],
          [`${SpanAttributes.LLM_COMPLETIONS}.0.role`]: "assistant",
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]:
                  response["completions"][0]["data"]["text"],
              }
            : {}),
        };
      }
      case "amazon": {
        return {
          [`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`]: isStream
            ? response["completionReason"]
            : response["results"][0]["completionReason"],
          [`${SpanAttributes.LLM_COMPLETIONS}.0.role`]: "assistant",
          [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]:
            response["inputTextTokenCount"],
          [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: isStream
            ? response["totalOutputTextTokenCount"]
            : response["results"][0]["tokenCount"],
          [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: isStream
            ? response["inputTextTokenCount"] +
              response["totalOutputTextTokenCount"]
            : response["inputTextTokenCount"] +
              response["results"][0]["tokenCount"],
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]: isStream
                  ? response["outputText"]
                  : response["results"][0]["outputText"],
              }
            : {}),
        };
      }
      case "anthropic": {
        return {
          [`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`]:
            response["stop_reason"],
          [`${SpanAttributes.LLM_COMPLETIONS}.0.role`]: "assistant",
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]:
                  response["completion"],
              }
            : {}),
        };
      }
      case "cohere": {
        return {
          [`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`]:
            response["generations"][0]["finish_reason"],
          [`${SpanAttributes.LLM_COMPLETIONS}.0.role`]: "assistant",
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]:
                  response["generations"][0]["text"],
              }
            : {}),
        };
      }
      case "meta": {
        return {
          [`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`]:
            response["stop_reason"],
          [`${SpanAttributes.LLM_COMPLETIONS}.0.role`]: "assistant",
          [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]:
            response["prompt_token_count"],
          [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]:
            response["generation_token_count"],
          [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]:
            response["prompt_token_count"] + response["generation_token_count"],
          ...(this._shouldSendPrompts()
            ? {
                [`${SpanAttributes.LLM_COMPLETIONS}.0.content`]:
                  response["generation"],
              }
            : {}),
        };
      }
      default:
        return {};
    }
  }

  private _shouldSendPrompts() {
    const contextShouldSendPrompts = context
      .active()
      .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

    if (contextShouldSendPrompts !== undefined) {
      return contextShouldSendPrompts;
    }

    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
