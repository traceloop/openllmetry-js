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
import type * as openai from "openai";
import { context, trace, Span, Attributes, SpanKind } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import { formatInputMessagesFromPrompt } from "@traceloop/instrumentation-utils";
import {
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
} from "@opentelemetry/semantic-conventions/incubating";
import { OpenAIInstrumentationConfig } from "./types";
import {
  buildOpenAIInputMessages,
  buildOpenAIOutputMessage,
  buildOpenAICompletionOutputMessage,
  openaiFinishReasonMap,
} from "./message-helpers";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  Completion,
  CompletionChoice,
  CompletionCreateParamsNonStreaming,
  CompletionCreateParamsStreaming,
} from "openai/resources";
import type { Stream } from "openai/streaming";
import { version } from "../package.json";
import { encodingForModel, TiktokenModel, Tiktoken } from "js-tiktoken";
// Type definition for APIPromise - compatible with both OpenAI v4 and v5+
// The actual import is handled at runtime via require() calls in the _wrapPromise method
type APIPromiseType<T> = Promise<T> & {
  _thenUnwrap: <U>(onFulfilled: (value: T) => U) => APIPromiseType<U>;
};
import {
  wrapImageGeneration,
  wrapImageEdit,
  wrapImageVariation,
} from "./image-wrappers";

export class OpenAIInstrumentation extends InstrumentationBase {
  declare protected _config: OpenAIInstrumentationConfig;

  constructor(config: OpenAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-openai", version, config);
  }

  public override setConfig(config: OpenAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: unknown) {
    this._diag.debug(`Manually instrumenting openai`);

    const openaiModule = module as any;

    this._wrap(
      openaiModule.Chat.Completions.prototype,
      "create",
      this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_CHAT),
    );
    this._wrap(
      openaiModule.Completions.prototype,
      "create",
      this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION),
    );

    if (openaiModule.Images) {
      this._wrap(
        openaiModule.Images.prototype,
        "generate",
        wrapImageGeneration(
          this.tracer,
          this._config.uploadBase64Image,
          this._config,
        ),
      );
      this._wrap(
        openaiModule.Images.prototype,
        "edit",
        wrapImageEdit(
          this.tracer,
          this._config.uploadBase64Image,
          this._config,
        ),
      );
      this._wrap(
        openaiModule.Images.prototype,
        "createVariation",
        wrapImageVariation(
          this.tracer,
          this._config.uploadBase64Image,
          this._config,
        ),
      );
    }
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "openai",
      [">=4 <7"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof openai, moduleVersion?: string) {
    this._diag.debug(`Patching openai@${moduleVersion}`);

    // Old version of OpenAI API (v3.1.0)
    if ((moduleExports as any).OpenAIApi) {
      this._wrap(
        (moduleExports as any).OpenAIApi.prototype,
        "createChatCompletion",
        this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_CHAT, "v3"),
      );
      this._wrap(
        (moduleExports as any).OpenAIApi.prototype,
        "createCompletion",
        this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION, "v3"),
      );
    } else {
      this._wrap(
        moduleExports.OpenAI.Chat.Completions.prototype,
        "create",
        this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_CHAT),
      );
      this._wrap(
        moduleExports.OpenAI.Completions.prototype,
        "create",
        this.patchOpenAI(GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION),
      );

      if (moduleExports.OpenAI.Images) {
        this._wrap(
          moduleExports.OpenAI.Images.prototype,
          "generate",
          wrapImageGeneration(
            this.tracer,
            this._config.uploadBase64Image,
            this._config,
          ),
        );
        this._wrap(
          moduleExports.OpenAI.Images.prototype,
          "edit",
          wrapImageEdit(
            this.tracer,
            this._config.uploadBase64Image,
            this._config,
          ),
        );
        this._wrap(
          moduleExports.OpenAI.Images.prototype,
          "createVariation",
          wrapImageVariation(
            this.tracer,
            this._config.uploadBase64Image,
            this._config,
          ),
        );
      }
    }
    return moduleExports;
  }

  private unpatch(moduleExports: typeof openai, moduleVersion?: string): void {
    this._diag.debug(`Unpatching openai@${moduleVersion}`);

    // Old version of OpenAI API (v3.1.0)
    if ((moduleExports as any).OpenAIApi) {
      this._unwrap(
        (moduleExports as any).OpenAIApi.prototype,
        "createChatCompletion",
      );
      this._unwrap(
        (moduleExports as any).OpenAIApi.prototype,
        "createCompletion",
      );
    } else {
      this._unwrap(moduleExports.OpenAI.Chat.Completions.prototype, "create");
      this._unwrap(moduleExports.OpenAI.Completions.prototype, "create");

      if (moduleExports.OpenAI.Images) {
        this._unwrap(moduleExports.OpenAI.Images.prototype, "generate");
        this._unwrap(moduleExports.OpenAI.Images.prototype, "edit");
        this._unwrap(moduleExports.OpenAI.Images.prototype, "createVariation");
      }
    }
  }

  private patchOpenAI(
    type:
      | typeof GEN_AI_OPERATION_NAME_VALUE_CHAT
      | typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
    version: "v3" | "v4" = "v4",
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const span =
          type === GEN_AI_OPERATION_NAME_VALUE_CHAT
            ? plugin.startSpan({
                type,
                params: args[0] as ChatCompletionCreateParamsNonStreaming & {
                  extraAttributes?: Record<string, any>;
                },
                client: this,
              })
            : plugin.startSpan({
                type: GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
                params: args[0] as CompletionCreateParamsNonStreaming & {
                  extraAttributes?: Record<string, any>;
                },
                client: this,
              });

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              if ((args?.[0] as any)?.extraAttributes) {
                delete (args[0] as any).extraAttributes;
              }
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error("OpenAI instrumentation: error", e);
            }
          },
        );

        if (
          (
            args[0] as
              | ChatCompletionCreateParamsStreaming
              | CompletionCreateParamsStreaming
          ).stream
        ) {
          return context.bind(
            execContext,
            plugin._streamingWrapPromise({
              span,
              type,
              params: args[0] as any,
              promise: execPromise,
            }),
          );
        }

        const wrappedPromise = plugin._wrapPromise(
          type,
          version,
          span,
          execPromise,
        );

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private startSpan({
    type,
    params,
    client,
  }:
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_CHAT;
        params: ChatCompletionCreateParamsNonStreaming & {
          extraAttributes?: Record<string, any>;
        };
        client: any;
      }
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
        params: CompletionCreateParamsNonStreaming & {
          extraAttributes?: Record<string, any>;
        };
        client: any;
      }): Span {
    const { provider } = this._detectVendorFromURL(client);

    const attributes: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: provider,
      [ATTR_GEN_AI_OPERATION_NAME]: type,
    };

    try {
      attributes[ATTR_GEN_AI_REQUEST_MODEL] = params.model;
      if (params.max_tokens) {
        attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
      }
      if (params.temperature) {
        attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
      }
      if (params.top_p) {
        attributes[ATTR_GEN_AI_REQUEST_TOP_P] = params.top_p;
      }
      if (params.frequency_penalty) {
        attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] =
          params.frequency_penalty;
      }
      if (params.presence_penalty) {
        attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] =
          params.presence_penalty;
      }

      if (
        params.extraAttributes !== undefined &&
        typeof params.extraAttributes === "object"
      ) {
        Object.keys(params.extraAttributes).forEach((key: string) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          attributes[key] = params.extraAttributes![key];
        });
      }

      if (this._shouldSendPrompts()) {
        if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
          // OpenAI puts system/developer messages in the chat history,
          // not as a separate parameter. Per OTel spec, they stay in
          // gen_ai.input.messages (not gen_ai.system_instructions).
          const inputMessages = buildOpenAIInputMessages(params.messages);

          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            JSON.stringify(inputMessages);

          // Tool/function definitions as single JSON attribute (OTel 1.40)
          // Spec: "The value of this attribute matches source system tool definition format."
          const toolDefs: object[] = [];
          // Legacy functions API — bare {name, description, parameters} IS the source format
          params.functions?.forEach((func) => {
            toolDefs.push(func);
          });
          // Tools API — preserve full {type, function: {...}} wrapper (source format)
          params.tools?.forEach((tool) => {
            toolDefs.push(tool);
          });
          if (toolDefs.length > 0) {
            attributes[ATTR_GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(toolDefs);
          }
        } else {
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            formatInputMessagesFromPrompt(
              typeof params.prompt === "string"
                ? params.prompt
                : JSON.stringify(params.prompt),
            );
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`${type} ${params?.model}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private async *_streamingWrapPromise({
    span,
    type,
    params,
    promise,
  }:
    | {
        span: Span;
        type: typeof GEN_AI_OPERATION_NAME_VALUE_CHAT;
        params: ChatCompletionCreateParamsStreaming;
        promise: APIPromiseType<Stream<ChatCompletionChunk>>;
      }
    | {
        span: Span;
        params: CompletionCreateParamsStreaming;
        type: typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
        promise: APIPromiseType<Stream<Completion>>;
      }) {
    if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
      const result: ChatCompletion = {
        id: "0",
        created: -1,
        model: "",
        choices: [
          {
            index: 0,
            logprobs: null,
            finish_reason: null as any,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [],
            } as any,
          },
        ],
        object: "chat.completion",
      };
      for await (const chunk of await promise) {
        yield chunk;

        result.id = chunk.id;
        result.created = chunk.created;
        result.model = chunk.model;

        if (chunk.choices[0]?.finish_reason) {
          result.choices[0].finish_reason = chunk.choices[0].finish_reason;
        }
        if (chunk.choices[0]?.logprobs) {
          result.choices[0].logprobs = chunk.choices[0].logprobs;
        }
        if (chunk.choices[0]?.delta.content) {
          result.choices[0].message.content += chunk.choices[0].delta.content;
        }
        if (
          chunk.choices[0]?.delta.function_call &&
          chunk.choices[0]?.delta.function_call.arguments &&
          chunk.choices[0]?.delta.function_call.name
        ) {
          // I needed to re-build the object so that Typescript will understand that `name` and `argument` are not null.
          result.choices[0].message.function_call = {
            name: chunk.choices[0].delta.function_call.name,
            arguments: chunk.choices[0].delta.function_call.arguments,
          };
        }
        if (chunk.usage) {
          result.usage = chunk.usage;
        }
        for (const toolCall of chunk.choices[0]?.delta?.tool_calls ?? []) {
          if (
            (result.choices[0].message.tool_calls?.length ?? 0) <
            toolCall.index + 1
          ) {
            result.choices[0].message.tool_calls?.push({
              function: {
                name: "",
                arguments: "",
              },
              id: "",
              type: "function",
            });
          }

          if (result.choices[0].message.tool_calls) {
            if (toolCall.id) {
              result.choices[0].message.tool_calls[toolCall.index].id +=
                toolCall.id;
            }
            if (toolCall.type) {
              result.choices[0].message.tool_calls[toolCall.index].type =
                toolCall.type;
            }
            if (toolCall.function?.name) {
              (
                result.choices[0].message.tool_calls[toolCall.index] as any
              ).function.name += toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              (
                result.choices[0].message.tool_calls[toolCall.index] as any
              ).function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      if (result.choices[0].logprobs?.content) {
        this._addLogProbsEvent(span, result.choices[0].logprobs);
      }

      if ((result.usage === undefined) && (this._config.enrichTokens)) {
        let promptTokens = 0;
        for (const message of params.messages) {
          promptTokens +=
            this.tokenCountFromString(
              message.content as string,
              result.model,
            ) ?? 0;
        }

        const completionTokens = this.tokenCountFromString(
          result.choices[0].message.content ?? "",
          result.model,
        );
        if (completionTokens) {
          result.usage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          };
        }
      }

      this._endSpan({ span, type, result });
    } else {
      const result: Completion = {
        id: "0",
        created: -1,
        model: "",
        choices: [
          {
            index: 0,
            logprobs: null,
            finish_reason: null as any,
            text: "",
          },
        ],
        object: "text_completion",
      };
      for await (const chunk of await promise) {
        yield chunk;

        try {
          result.id = chunk.id;
          result.created = chunk.created;
          result.model = chunk.model;

          if (chunk.choices[0]?.finish_reason) {
            result.choices[0].finish_reason = chunk.choices[0].finish_reason;
          }
          if (chunk.choices[0]?.logprobs) {
            result.choices[0].logprobs = chunk.choices[0].logprobs;
          }
          if (chunk.choices[0]?.text) {
            result.choices[0].text += chunk.choices[0].text;
          }
        } catch (e) {
          this._diag.debug(e);
          this._config.exceptionLogger?.(e);
        }
      }

      try {
        if (result.choices[0].logprobs) {
          this._addLogProbsEvent(span, result.choices[0].logprobs);
        }

        if (this._config.enrichTokens) {
          const promptTokens =
            this.tokenCountFromString(params.prompt as string, result.model) ??
            0;

          const completionTokens = this.tokenCountFromString(
            result.choices[0].text ?? "",
            result.model,
          );
          if (completionTokens) {
            result.usage = {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            };
          }
        }
      } catch (e) {
        this._diag.debug(e);
        this._config.exceptionLogger?.(e);
      }

      this._endSpan({ span, type, result });
    }
  }

  private _wrapPromise<T>(
    type:
      | typeof GEN_AI_OPERATION_NAME_VALUE_CHAT
      | typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
    version: "v3" | "v4",
    span: Span,
    promise: APIPromiseType<T>,
  ): APIPromiseType<T> {
    return promise._thenUnwrap((result) => {
      if (version === "v3") {
        if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
          this._addLogProbsEvent(
            span,
            ((result as any).data as ChatCompletion).choices[0].logprobs,
          );
          this._endSpan({
            type,
            span,
            result: (result as any).data as ChatCompletion,
          });
        } else {
          this._addLogProbsEvent(
            span,
            ((result as any).data as Completion).choices[0].logprobs,
          );
          this._endSpan({
            type,
            span,
            result: (result as any).data as Completion,
          });
        }
      } else {
        if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
          this._addLogProbsEvent(
            span,
            (result as ChatCompletion).choices[0].logprobs,
          );
          this._endSpan({ type, span, result: result as ChatCompletion });
        } else {
          this._addLogProbsEvent(
            span,
            (result as Completion).choices[0].logprobs,
          );
          this._endSpan({ type, span, result: result as Completion });
        }
      }

      return result;
    });
  }

  private _endSpan({
    span,
    type,
    result,
  }:
    | {
        span: Span;
        type: typeof GEN_AI_OPERATION_NAME_VALUE_CHAT;
        result: ChatCompletion;
      }
    | {
        span: Span;
        type: typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
        result: Completion;
      }) {
    try {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, result.model);
      if (result.id) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, result.id);
      }
      if (result.usage) {
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
          result.usage?.total_tokens,
        );
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          result.usage?.completion_tokens,
        );
        span.setAttribute(
          ATTR_GEN_AI_USAGE_INPUT_TOKENS,
          result.usage?.prompt_tokens,
        );
      }

      if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
        // Set finish reasons (always — it's metadata, not user content)
        const finishReason = result.choices[0]?.finish_reason;
        const mappedReason =
          openaiFinishReasonMap[finishReason] ?? finishReason ?? "stop";
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [mappedReason]);

        if (this._shouldSendPrompts()) {
          const outputMessages = buildOpenAIOutputMessage(
            result.choices[0],
            openaiFinishReasonMap,
          );
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            JSON.stringify(outputMessages),
          );
        }
      } else {
        // Text completion
        const finishReason = result.choices[0]?.finish_reason;
        const mappedReason =
          openaiFinishReasonMap[finishReason] ?? finishReason ?? "stop";
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [mappedReason]);

        if (this._shouldSendPrompts()) {
          const outputMessages = buildOpenAICompletionOutputMessage(
            result.choices[0],
            openaiFinishReasonMap,
          );
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            JSON.stringify(outputMessages),
          );
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    span.end();
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

  private _addLogProbsEvent(
    span: Span,
    logprobs:
      | ChatCompletion.Choice.Logprobs
      | ChatCompletionChunk.Choice.Logprobs
      | CompletionChoice.Logprobs
      | null,
  ) {
    try {
      let result: { token: string; logprob: number }[] = [];

      if (!logprobs) {
        return;
      }

      const chatLogprobs = logprobs as
        | ChatCompletion.Choice.Logprobs
        | ChatCompletionChunk.Choice.Logprobs;
      const completionLogprobs = logprobs as CompletionChoice.Logprobs;
      if (chatLogprobs.content) {
        result = chatLogprobs.content.map((logprob) => {
          return {
            token: logprob.token,
            logprob: logprob.logprob,
          };
        });
      } else if (
        completionLogprobs?.tokens &&
        completionLogprobs?.token_logprobs
      ) {
        completionLogprobs.tokens.forEach((token, index) => {
          const logprob = completionLogprobs.token_logprobs?.[index];
          if (logprob) {
            result.push({
              token,
              logprob,
            });
          }
        });
      }

      span.addEvent("logprobs", { logprobs: JSON.stringify(result) });
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }
  }

  private _encodingCache = new Map<string, Tiktoken>();

  private tokenCountFromString(text: string, model: string) {
    if (!text) {
      return 0;
    }

    let encoding = this._encodingCache.get(model);

    if (!encoding) {
      try {
        encoding = encodingForModel(model as TiktokenModel);
        this._encodingCache.set(model, encoding);
      } catch (e) {
        this._diag.debug(e);
        this._config.exceptionLogger?.(e);
        return 0;
      }
    }

    return encoding.encode(text).length;
  }

  private _detectVendorFromURL(client: any): {
    provider: string;
  } {
    try {
      if (!client?.baseURL) {
        return { provider: GEN_AI_PROVIDER_NAME_VALUE_OPENAI };
      }

      const baseURL = client.baseURL.toLowerCase();

      if (baseURL.includes("azure") || baseURL.includes("openai.azure.com")) {
        return { provider: GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI };
      }

      if (
        baseURL.includes("openai.com") ||
        baseURL.includes("api.openai.com")
      ) {
        return { provider: GEN_AI_PROVIDER_NAME_VALUE_OPENAI };
      }

      if (baseURL.includes("amazonaws.com") || baseURL.includes("bedrock")) {
        return { provider: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK };
      }

      if (baseURL.includes("aiplatform.googleapis.com")) {
        return { provider: GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI };
      }

      if (baseURL.includes("generativelanguage.googleapis.com")) {
        return { provider: "gcp.gemini" };
      }

      if (baseURL.includes("googleapis.com")) {
        return { provider: "gcp.gen_ai" }; // fallback for other Google APIs
      }

      if (baseURL.includes("openrouter")) {
        return { provider: "openrouter" };
      }

      return { provider: GEN_AI_PROVIDER_NAME_VALUE_OPENAI };
    } catch (e) {
      this._diag.debug(`Failed to detect vendor from URL: ${e}`);
      return { provider: GEN_AI_PROVIDER_NAME_VALUE_OPENAI };
    }
  }
}
