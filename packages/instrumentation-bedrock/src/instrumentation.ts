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
import { BedrockInstrumentationConfig, BedrockVendor } from "./types";
import type * as bedrock from "@aws-sdk/client-bedrock-runtime";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  LLMRequestTypeValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  ATTR_GEN_AI_PROVIDER_NAME,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  formatInputMessages,
  formatInputMessagesFromPrompt,
  formatOutputMessage,
  formatSystemInstructions,
  mapBedrockContentBlock,
} from "@traceloop/instrumentation-utils";
import { version } from "../package.json";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";

export const bedrockFinishReasonMap: Record<string, string> = {
  // AI21
  endoftext: FinishReasons.STOP,
  // Amazon Titan / Nova
  FINISH: FinishReasons.STOP,
  LENGTH: FinishReasons.LENGTH,
  CONTENT_FILTERED: FinishReasons.CONTENT_FILTER,
  // Anthropic
  end_turn: FinishReasons.STOP,
  max_tokens: FinishReasons.LENGTH,
  stop_sequence: FinishReasons.STOP,
  tool_use: FinishReasons.TOOL_CALL,
  // Cohere
  COMPLETE: FinishReasons.STOP,
  MAX_TOKENS: FinishReasons.LENGTH,
  ERROR: FinishReasons.ERROR,
  ERROR_TOXIC: FinishReasons.CONTENT_FILTER,
  // Meta
  stop: FinishReasons.STOP,
  length: FinishReasons.LENGTH,
};

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
    let spanName = "bedrock.completion";

    try {
      const input = params.input as bedrock.InvokeModelCommandInput;
      const { modelVendor, model } = this._extractVendorAndModel(
        input.modelId || "",
      );

      attributes = {
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: input.modelId,
        [SpanAttributes.LLM_REQUEST_TYPE]: LLMRequestTypeValues.COMPLETION,
      };

      if (typeof input.body === "string") {
        const requestBody = JSON.parse(input.body);
        const operationType = this._getOperationType(modelVendor, requestBody);
        spanName = `${operationType} ${model}`;
        // Set operation name before _setRequestAttributes so it is always
        // present even if _setRequestAttributes throws for an unexpected body.
        attributes = {
          ...attributes,
          [ATTR_GEN_AI_OPERATION_NAME]: operationType,
        };
        attributes = {
          ...attributes,
          ...this._setRequestAttributes(modelVendor, requestBody),
        };
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(spanName, {
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

        if (ATTR_GEN_AI_PROVIDER_NAME in attributes) {
          const modelId = attributes[ATTR_GEN_AI_RESPONSE_MODEL] as string;
          const { modelVendor, model } = this._extractVendorAndModel(modelId);

          span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);

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
                  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "inputTokenCount"
                  ],
                );
                span.setAttribute(
                  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "outputTokenCount"
                  ],
                );

                const totalTokens =
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "inputTokenCount"
                  ] +
                  parsedResponse["amazon-bedrock-invocationMetrics"][
                    "outputTokenCount"
                  ];
                span.setAttribute(
                  SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
                  totalTokens,
                );
              }

              this._handleNovaStreamingMetadata(span, parsedResponse);

              const responseAttributes = this._setResponseAttributes(
                modelVendor,
                parsedResponse,
                true,
              );

              // ! NOTE: This make sure the content always have all streamed chunks
              if (this._shouldSendPrompts()) {
                const chunkContent = this._getStreamChunkContent(
                  modelVendor,
                  parsedResponse,
                );
                if (chunkContent !== undefined) {
                  streamedContent += chunkContent;
                }

                // When finish reason is available (final chunk), set OTel 1.40 output message
                if (responseAttributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]) {
                  const finishReasons = responseAttributes[
                    ATTR_GEN_AI_RESPONSE_FINISH_REASONS
                  ] as string[];
                  responseAttributes[ATTR_GEN_AI_OUTPUT_MESSAGES] =
                    formatOutputMessage(
                      streamedContent,
                      finishReasons[0] ?? null,
                      {}, // already mapped by _setResponseAttributes
                      attributes[ATTR_GEN_AI_OPERATION_NAME],
                      mapBedrockContentBlock,
                    );
                }
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
              modelVendor,
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
      case BedrockVendor.AI21: {
        // Jamba format: messages array + max_tokens + top_p
        if (requestBody["messages"]) {
          return {
            [ATTR_GEN_AI_REQUEST_TOP_P]: requestBody["top_p"],
            [ATTR_GEN_AI_REQUEST_TEMPERATURE]: requestBody["temperature"],
            [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: requestBody["max_tokens"],
            ...(this._shouldSendPrompts()
              ? {
                  [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessages(
                    requestBody["messages"],
                    mapBedrockContentBlock,
                  ),
                }
              : {}),
          };
        }

        // Legacy Jurassic format: prompt + topP + maxTokens
        return {
          [ATTR_GEN_AI_REQUEST_TOP_P]: requestBody["topP"],
          [ATTR_GEN_AI_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: requestBody["maxTokens"],
          [ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY]:
            requestBody["presencePenalty"]?.["scale"],
          [ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY]:
            requestBody["frequencyPenalty"]?.["scale"],
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessagesFromPrompt(
                  requestBody["prompt"],
                ),
              }
            : {}),
        };
      }
      case BedrockVendor.AMAZON: {
        // Amazon Nova format: messages array + inferenceConfig
        if (requestBody["messages"]) {
          return {
            [ATTR_GEN_AI_REQUEST_TOP_P]:
              requestBody["inferenceConfig"]?.["topP"],
            [ATTR_GEN_AI_REQUEST_TEMPERATURE]:
              requestBody["inferenceConfig"]?.["temperature"],
            [ATTR_GEN_AI_REQUEST_MAX_TOKENS]:
              requestBody["inferenceConfig"]?.["maxTokens"],
            ...(this._shouldSendPrompts()
              ? {
                  [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessages(
                    requestBody["messages"],
                    mapBedrockContentBlock,
                  ),
                }
              : {}),
          };
        }

        // Amazon Titan format: inputText + textGenerationConfig
        return {
          [ATTR_GEN_AI_REQUEST_TOP_P]:
            requestBody["textGenerationConfig"]?.["topP"],
          [ATTR_GEN_AI_REQUEST_TEMPERATURE]:
            requestBody["textGenerationConfig"]?.["temperature"],
          [ATTR_GEN_AI_REQUEST_MAX_TOKENS]:
            requestBody["textGenerationConfig"]?.["maxTokenCount"],
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessagesFromPrompt(
                  requestBody["inputText"],
                ),
              }
            : {}),
        };
      }
      case BedrockVendor.ANTHROPIC: {
        const baseAttributes = {
          [ATTR_GEN_AI_REQUEST_TOP_P]: requestBody["top_p"],
          [ATTR_GEN_AI_REQUEST_TOP_K]: requestBody["top_k"],
          [ATTR_GEN_AI_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [ATTR_GEN_AI_REQUEST_MAX_TOKENS]:
            requestBody["max_tokens_to_sample"] || requestBody["max_tokens"],
        };

        if (!this._shouldSendPrompts()) {
          return baseAttributes;
        }

        // Handle new messages API format (used by langchain)
        if (requestBody["messages"]) {
          const promptAttributes: Record<string, any> = {
            [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessages(
              requestBody["messages"],
              mapBedrockContentBlock,
            ),
          };
          if (requestBody["system"] !== undefined) {
            promptAttributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] =
              formatSystemInstructions(requestBody["system"]);
          }
          return { ...baseAttributes, ...promptAttributes };
        }

        // Handle legacy prompt format
        if (requestBody["prompt"]) {
          return {
            ...baseAttributes,
            [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessagesFromPrompt(
              requestBody["prompt"]
                .replace("\n\nHuman:", "")
                .replace("\n\nAssistant:", ""),
            ),
          };
        }

        return baseAttributes;
      }
      case BedrockVendor.COHERE: {
        return {
          [ATTR_GEN_AI_REQUEST_TOP_P]: requestBody["p"],
          [ATTR_GEN_AI_REQUEST_TOP_K]: requestBody["k"],
          [ATTR_GEN_AI_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: requestBody["max_tokens"],
        };
      }
      case BedrockVendor.META: {
        return {
          [ATTR_GEN_AI_REQUEST_TOP_P]: requestBody["top_p"],
          [ATTR_GEN_AI_REQUEST_TEMPERATURE]: requestBody["temperature"],
          [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: requestBody["max_gen_len"],
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_INPUT_MESSAGES]: formatInputMessagesFromPrompt(
                  requestBody["prompt"],
                ),
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
      case BedrockVendor.AI21: {
        // Jamba format: choices[0].message + choices[0].finish_reason
        if (response["choices"]) {
          const usage = response["usage"];
          const finishReason = response["choices"][0]?.["finish_reason"];
          const content = isStream
            ? response["choices"][0]?.["delta"]?.["content"]
            : response["choices"][0]?.["message"]?.["content"];
          return {
            ...(finishReason != null
              ? {
                  [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                    bedrockFinishReasonMap[finishReason] ?? finishReason,
                  ],
                }
              : {}),
            ...(usage
              ? {
                  [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage["prompt_tokens"],
                  [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage["completion_tokens"],
                  [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                    usage["total_tokens"],
                }
              : {}),
            ...(this._shouldSendPrompts()
              ? {
                  [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
                    content ?? "",
                    finishReason,
                    bedrockFinishReasonMap,
                    GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
                    mapBedrockContentBlock,
                  ),
                }
              : {}),
          };
        }

        // Legacy Jurassic format: completions[0].data.text
        const jurassicFinishReason =
          response["completions"][0]["finishReason"]["reason"];
        const jurassicContent = response["completions"][0]["data"]["text"];
        return {
          [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
            bedrockFinishReasonMap[jurassicFinishReason] ??
              jurassicFinishReason,
          ],
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
                  jurassicContent,
                  jurassicFinishReason,
                  bedrockFinishReasonMap,
                  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
                  mapBedrockContentBlock,
                ),
              }
            : {}),
        };
      }
      case BedrockVendor.AMAZON: {
        if (isStream) {
          // Amazon Nova format: contentBlockDelta has text, messageStop has stopReason
          const novaFinishReason = response["messageStop"]?.["stopReason"];
          // Amazon Titan format: outputText, completionReason
          const titanFinishReason = response["completionReason"];
          const finishReason = novaFinishReason ?? titanFinishReason;

          return {
            ...(finishReason != null
              ? {
                  [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                    bedrockFinishReasonMap[finishReason] ?? finishReason,
                  ],
                }
              : {}),
            // Titan includes token counts on the final chunk
            ...(response["inputTextTokenCount"] != null
              ? {
                  [ATTR_GEN_AI_USAGE_INPUT_TOKENS]:
                    response["inputTextTokenCount"],
                  [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]:
                    response["totalOutputTextTokenCount"],
                  [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                    response["inputTextTokenCount"] +
                    response["totalOutputTextTokenCount"],
                }
              : {}),
          };
        }

        // Amazon Titan token fields
        const titanInputTokens = response["inputTextTokenCount"];
        const titanOutputTokens = response["results"]?.[0]?.["tokenCount"];
        // Amazon Nova token fields
        const novaUsage = response["usage"];

        const amazonFinishReason =
          response["results"]?.[0]?.["completionReason"] ??
          response["stopReason"];
        const novaRawContent = response["output"]?.["message"]?.["content"];
        const titanContent = response["results"]?.[0]?.["outputText"];
        const outputContent = novaRawContent ?? titanContent ?? "";
        const operationType = novaRawContent
          ? GEN_AI_OPERATION_NAME_VALUE_CHAT
          : GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;

        return {
          ...(amazonFinishReason != null
            ? {
                [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                  bedrockFinishReasonMap[amazonFinishReason] ??
                    amazonFinishReason,
                ],
              }
            : {}),
          ...(titanInputTokens != null
            ? {
                [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: titanInputTokens,
                [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: titanOutputTokens,
                [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                  titanInputTokens + titanOutputTokens,
              }
            : novaUsage != null
              ? {
                  [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: novaUsage["inputTokens"],
                  [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: novaUsage["outputTokens"],
                  [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                    novaUsage["totalTokens"],
                }
              : {}),
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
                  outputContent,
                  amazonFinishReason,
                  bedrockFinishReasonMap,
                  operationType,
                  mapBedrockContentBlock,
                ),
              }
            : {}),
        };
      }
      case BedrockVendor.ANTHROPIC: {
        if (isStream) {
          // New messages API streaming: content_block_delta has delta.text,
          // message_delta has delta.stop_reason
          const stopReason =
            response["delta"]?.["stop_reason"] ?? response["stop_reason"];
          const finishReason = stopReason ?? undefined;

          return {
            ...(finishReason != null
              ? {
                  [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                    bedrockFinishReasonMap[finishReason] ?? finishReason,
                  ],
                }
              : {}),
          };
        }

        const stopReason = response["stop_reason"];
        const usage = response["usage"];
        const baseAttributes: Record<string, any> = {
          ...(stopReason != null
            ? {
                [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                  bedrockFinishReasonMap[stopReason] ?? stopReason,
                ],
              }
            : {}),
          // Anthropic new messages API returns usage on non-streaming response
          ...(usage
            ? {
                [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage["input_tokens"],
                [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage["output_tokens"],
                [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                  (usage["input_tokens"] || 0) + (usage["output_tokens"] || 0),
              }
            : {}),
        };

        if (!this._shouldSendPrompts()) {
          return baseAttributes;
        }

        // Handle new messages API format response
        if (response["content"]) {
          const content = Array.isArray(response["content"])
            ? response["content"]
            : response["content"];
          return {
            ...baseAttributes,
            [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
              content,
              stopReason,
              bedrockFinishReasonMap,
              GEN_AI_OPERATION_NAME_VALUE_CHAT,
              mapBedrockContentBlock,
            ),
          };
        }

        // Handle legacy completion format
        if (response["completion"]) {
          return {
            ...baseAttributes,
            [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
              response["completion"],
              stopReason,
              bedrockFinishReasonMap,
              GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
              mapBedrockContentBlock,
            ),
          };
        }

        return baseAttributes;
      }
      case BedrockVendor.COHERE: {
        const cohereFinishReason =
          response["generations"]?.[0]?.["finish_reason"] ??
          response["finish_reason"];
        const cohereText =
          response["generations"]?.[0]?.["text"] ?? response["text"];

        return {
          ...(cohereFinishReason != null
            ? {
                [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                  bedrockFinishReasonMap[cohereFinishReason] ??
                    cohereFinishReason,
                ],
              }
            : {}),
          // Add token usage if available
          ...(response["meta"]?.["billed_units"]
            ? {
                [ATTR_GEN_AI_USAGE_INPUT_TOKENS]:
                  response["meta"]["billed_units"]["input_tokens"],
                [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]:
                  response["meta"]["billed_units"]["output_tokens"],
                [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
                  (response["meta"]["billed_units"]["input_tokens"] || 0) +
                  (response["meta"]["billed_units"]["output_tokens"] || 0),
              }
            : {}),
          ...(this._shouldSendPrompts() && cohereText != null
            ? {
                [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
                  cohereText,
                  cohereFinishReason,
                  bedrockFinishReasonMap,
                  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
                  mapBedrockContentBlock,
                ),
              }
            : {}),
        };
      }
      case BedrockVendor.META: {
        const metaFinishReason = response["stop_reason"];
        const metaContent = response["generation"];
        return {
          ...(metaFinishReason != null
            ? {
                [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
                  bedrockFinishReasonMap[metaFinishReason] ?? metaFinishReason,
                ],
              }
            : {}),
          [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: response["prompt_token_count"],
          [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: response["generation_token_count"],
          [SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]:
            response["prompt_token_count"] + response["generation_token_count"],
          ...(this._shouldSendPrompts()
            ? {
                [ATTR_GEN_AI_OUTPUT_MESSAGES]: formatOutputMessage(
                  metaContent ?? "",
                  metaFinishReason,
                  bedrockFinishReasonMap,
                  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
                  mapBedrockContentBlock,
                ),
              }
            : {}),
        };
      }
      default:
        return {};
    }
  }

  private _handleNovaStreamingMetadata(
    span: Span,
    parsedResponse: Record<string, any>,
  ): void {
    if ("metadata" in parsedResponse && parsedResponse["metadata"]?.["usage"]) {
      const usage = parsedResponse["metadata"]["usage"];
      span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage["inputTokens"]);
      span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage["outputTokens"]);
      span.setAttribute(
        SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
        usage["totalTokens"],
      );
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

  private _getOperationType(
    vendor: string,
    requestBody: Record<string, any>,
  ): string {
    switch (vendor) {
      case BedrockVendor.AI21:
      case BedrockVendor.AMAZON:
      case BedrockVendor.ANTHROPIC:
        return requestBody["messages"]
          ? GEN_AI_OPERATION_NAME_VALUE_CHAT
          : GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
      case BedrockVendor.COHERE:
      case BedrockVendor.META:
        return GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
      default:
        return GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
    }
  }

  private _getStreamChunkContent(
    vendor: string,
    response: Record<string, any>,
  ): string | undefined {
    switch (vendor) {
      case BedrockVendor.AMAZON:
        return (
          response["contentBlockDelta"]?.["delta"]?.["text"] ??
          response["outputText"]
        );
      case BedrockVendor.ANTHROPIC:
        return response["delta"]?.["text"] ?? response["completion"];
      case BedrockVendor.AI21:
        return response["choices"]?.[0]?.["delta"]?.["content"];
      case BedrockVendor.META:
        return response["generation"];
      default:
        return undefined;
    }
  }

  private _extractVendorAndModel(modelId: string): {
    modelVendor: string;
    model: string;
  } {
    if (!modelId) {
      return { modelVendor: "", model: "" };
    }

    // Handle cross-region inference profile IDs like "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
    // Mirrors Python's _cross_region_check logic.
    const prefixes = ["us", "us-gov", "eu", "apac"];
    const hasCrossRegionPrefix = prefixes.some((prefix) =>
      modelId.startsWith(prefix + "."),
    );

    if (hasCrossRegionPrefix) {
      const parts = modelId.split(".");
      if (parts.length > 2) {
        parts.shift(); // remove region prefix ("us", "eu", etc.)
      }
      return { modelVendor: parts[0] || "", model: parts[1] || "" };
    }

    // Standard format: "vendor.model-name"
    const dotIndex = modelId.indexOf(".");
    if (dotIndex === -1) {
      return { modelVendor: modelId, model: "" };
    }
    return {
      modelVendor: modelId.slice(0, dotIndex),
      model: modelId.slice(dotIndex + 1),
    };
  }
}
