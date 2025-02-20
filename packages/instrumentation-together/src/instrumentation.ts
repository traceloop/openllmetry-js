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
import type * as togetherai from "together-ai";
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
import { TogetherAIInstrumentationConfig } from "./types";
import type { Completion } from "together-ai/resources";

import type { Stream } from "together-ai/streaming";
import { version } from "../package.json";
import { encodingForModel, TiktokenModel, Tiktoken } from "js-tiktoken";
import { APIPromise } from "together-ai/core";
import {
  ChatCompletionChunk,
  ChatCompletion,
  CompletionCreateParamsStreaming as ChatCompletionCreateParamsStreaming,
  CompletionCreateParamsNonStreaming as ChatCompletionCreateParamsNonStreaming,
} from "together-ai/resources/chat";

import {
  CompletionCreateParamsStreaming as CompletionCreateParamsStreaming,
  CompletionCreateParamsNonStreaming as CompletionCreateParamsNonStreaming,
} from "together-ai/resources";

type CompletionCreateParamsStreamingType =
  | ChatCompletionCreateParamsStreaming
  | CompletionCreateParamsStreaming;

export class TogetherInstrumentation extends InstrumentationBase {
  declare protected _config: TogetherAIInstrumentationConfig;

  constructor(config: TogetherAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-together-ai", version, config);
  }

  public override setConfig(config: TogetherAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof togetherai.Together) {
    this._diag.debug(`Manually instrumenting togetherai`);
    this._wrap(
      module.Chat.Completions.prototype,
      "create",
      this.patchTogether("chat"),
    );
    this._wrap(
      module.Completions.prototype,
      "create",
      this.patchTogether("completion"),
    );
  }

  protected init(): InstrumentationModuleDefinition {
    console.log("init");
    const module = new InstrumentationNodeModuleDefinition(
      "together-ai",
      [">=0.13.0"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof togetherai, moduleVersion?: string) {
    console.log("patch");
    this._diag.debug(`Patching togetherai@${moduleVersion}`);
    this._wrap(
      moduleExports.Together.Chat.Completions.prototype,
      "create",
      this.patchTogether("chat"),
    );
    this._wrap(
      moduleExports.Together.Completions.prototype,
      "create",
      this.patchTogether("completion"),
    );

    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof togetherai,
    moduleVersion?: string,
  ): void {
    this._diag.debug(`Unpatching togetherai@${moduleVersion}`);

    this._unwrap(moduleExports.Together.Chat.Completions.prototype, "create");
    this._unwrap(moduleExports.Together.Completions.prototype, "create");
  }

  private patchTogether(type: "chat" | "completion") {
    console.log(`Setting up patch for ${type}`);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        console.log(`Executing ${type} method with args:`, args);
        const span =
          type === "chat"
            ? plugin.startSpan({
                type,
                params: args[0] as ChatCompletionCreateParamsNonStreaming & {
                  extraAttributes?: Record<string, any>;
                },
              })
            : plugin.startSpan({
                type,
                params: args[0] as CompletionCreateParamsNonStreaming & {
                  extraAttributes?: Record<string, any>;
                },
              });

        console.log(`Created span for ${type}`);

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              if ((args?.[0] as any)?.extraAttributes) {
                delete (args[0] as any).extraAttributes;
              }
              console.log(`Calling original ${type} method`);
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              console.error(`Error in ${type} instrumentation:`, e);
              plugin._diag.error("Together instrumentation: error", e);
            }
          },
        );

        if ((args[0] as CompletionCreateParamsStreamingType).stream) {
          console.log(`${type} is streaming`);
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

        console.log(`${type} is not streaming, wrapping promise`);
        const wrappedPromise = plugin._wrapPromise(type, span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private startSpan({
    type,
    params,
  }:
    | {
        type: "chat";
        params: ChatCompletionCreateParamsNonStreaming & {
          extraAttributes?: Record<string, any>;
        };
      }
    | {
        type: "completion";
        params: CompletionCreateParamsNonStreaming & {
          extraAttributes?: Record<string, any>;
        };
      }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_SYSTEM]: "TogetherAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: type,
    };

    try {
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
      if (params.max_tokens) {
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] = params.max_tokens;
      }
      if (params.temperature) {
        attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE] = params.temperature;
      }
      if (params.top_p) {
        attributes[SpanAttributes.LLM_REQUEST_TOP_P] = params.top_p;
      }
      if (params.frequency_penalty) {
        attributes[SpanAttributes.LLM_FREQUENCY_PENALTY] =
          params.frequency_penalty;
      }
      if (params.presence_penalty) {
        attributes[SpanAttributes.LLM_PRESENCE_PENALTY] =
          params.presence_penalty;
      }

      if (
        params.extraAttributes !== undefined &&
        typeof params.extraAttributes === "object"
      ) {
        Object.keys(params.extraAttributes).forEach((key: string) => {
          attributes[key] = params.extraAttributes![key];
        });
      }

      if (this._shouldSendPrompts()) {
        if (type === "chat") {
          params.messages.forEach((message, index) => {
            attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
              message.role;
            if (typeof message.content === "string") {
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
                (message.content as string) || "";
            } else {
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
                JSON.stringify(message.content);
            }
          });
          params.tools?.forEach((func, index) => {
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`
            ] = func.function?.name;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`
            ] = func.function?.description;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.arguments`
            ] = JSON.stringify(func.function?.parameters);
          });
          params.tools?.forEach((tool, index) => {
            if (!tool.function) {
              return;
            }

            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`
            ] = tool.function.name;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`
            ] = tool.function.description;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.arguments`
            ] = JSON.stringify(tool.function.parameters);
          });
        } else {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          if (typeof params.prompt === "string") {
            attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
              params.prompt;
          } else {
            attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
              JSON.stringify(params.prompt);
          }
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`togetherai.${type}`, {
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
        type: "chat";
        params: ChatCompletionCreateParamsStreaming;
        promise: APIPromise<Stream<ChatCompletionChunk>>;
      }
    | {
        span: Span;
        params: CompletionCreateParamsStreaming;
        type: "completion";
        promise: APIPromise<Stream<Completion>>;
      }) {
    if (type === "chat") {
      const result: ChatCompletion = {
        id: "0",
        created: -1,
        model: "",
        choices: [
          {
            index: 0,
            logprobs: null,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "",

              tool_calls: [],
            },
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

        if (result.choices[0].message && chunk.choices[0]?.delta.content) {
          result.choices[0].message.content += chunk.choices[0].delta.content;
        }
        if (
          result.choices[0].message &&
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
        for (const toolCall of chunk.choices[0]?.delta?.tool_calls ?? []) {
          if (
            result.choices[0].message &&
            (result.choices[0].message?.tool_calls?.length ?? 0) <
              toolCall.index + 1
          ) {
            result.choices[0].message.tool_calls?.push({
              function: {
                name: "",
                arguments: "",
              },
              id: "",
              type: "function",
              index: toolCall.index,
            });
          }

          if (
            result.choices[0].message &&
            result.choices[0].message.tool_calls
          ) {
            if (toolCall.id) {
              result.choices[0].message.tool_calls[toolCall.index].id +=
                toolCall.id;
            }
            if (result.choices[0].message && toolCall.type) {
              result.choices[0].message.tool_calls[toolCall.index].type +=
                toolCall.type;
            }
            if (result.choices[0].message && toolCall.function?.name) {
              result.choices[0].message.tool_calls[
                toolCall.index
              ].function.name += toolCall.function.name;
            }
            if (result.choices[0].message && toolCall.function?.arguments) {
              result.choices[0].message.tool_calls[
                toolCall.index
              ].function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      if (this._config.enrichTokens) {
        let promptTokens = 0;
        for (const message of params.messages) {
          promptTokens +=
            this.tokenCountFromString(
              message.content as string,
              result.model,
            ) ?? 0;
        }

        const completionTokens = this.tokenCountFromString(
          result.choices[0].message?.content ?? "",
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
            finish_reason: "stop",
            text: "",
          },
        ],
        object: "text_completion",
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
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
    type: "chat" | "completion",
    span: Span,
    promise: APIPromise<T>,
  ): APIPromise<T> {
    return promise._thenUnwrap((result) => {
      console.log(`Got ${type} result:`, result);
      if (type === "chat") {
        this._endSpan({
          type,
          span,
          result: result as ChatCompletion,
        });
      } else {
        this._endSpan({
          type,
          span,
          result: result as Completion,
        });
      }

      return result;
    });
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

  private _endSpan({
    span,
    type,
    result,
  }:
    | { span: Span; type: "chat"; result: ChatCompletion }
    | { span: Span; type: "completion"; result: Completion }) {
    try {
      span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, result.model);
      if (result.usage) {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.usage?.total_tokens,
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          result.usage?.completion_tokens,
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          result.usage?.prompt_tokens,
        );
      }

      if (this._shouldSendPrompts()) {
        if (type === "chat") {
          result.choices.forEach((choice, index) => {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
              choice.finish_reason ?? "",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              choice.message?.role ?? "",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              choice.message?.content ?? "",
            );

            if (choice.message?.function_call) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.name`,
                choice.message?.function_call?.name ?? "",
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.arguments`,
                choice.message?.function_call?.arguments ?? "",
              );
            }
            for (const [
              toolIndex,
              toolCall,
            ] of choice?.message?.tool_calls?.entries() || []) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.tool_calls.${toolIndex}.name`,
                toolCall.function.name,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.tool_calls.${toolIndex}.arguments`,
                toolCall.function.arguments,
              );
            }
          });
        } else {
          result.choices.forEach((choice, index) => {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
              choice.finish_reason ?? "",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              "assistant",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              choice.text ?? "",
            );
          });
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    span.end();
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
}
