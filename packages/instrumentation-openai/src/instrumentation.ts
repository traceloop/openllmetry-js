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
import { OpenAIInstrumentationConfig } from "./types";
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
import { APIPromise } from "openai/core";

export class OpenAIInstrumentation extends InstrumentationBase {
  declare protected _config: OpenAIInstrumentationConfig;

  constructor(config: OpenAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-openai", version, config);
  }

  public override setConfig(config: OpenAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof openai.OpenAI) {
    this._diag.debug(`Manually instrumenting openai`);

    // Old version of OpenAI API (v3.1.0)
    if ((module as any).OpenAIApi) {
      this._wrap(
        (module as any).OpenAIApi.prototype,
        "createChatCompletion",
        this.patchOpenAI("chat", "v3"),
      );
      this._wrap(
        (module as any).OpenAIApi.prototype,
        "createCompletion",
        this.patchOpenAI("completion", "v3"),
      );
    } else {
      this._wrap(
        module.Chat.Completions.prototype,
        "create",
        this.patchOpenAI("chat"),
      );
      this._wrap(
        module.Completions.prototype,
        "create",
        this.patchOpenAI("completion"),
      );
    }
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "openai",
      [">=3.1.0 <5"],
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
        this.patchOpenAI("chat", "v3"),
      );
      this._wrap(
        (moduleExports as any).OpenAIApi.prototype,
        "createCompletion",
        this.patchOpenAI("completion", "v3"),
      );
    } else {
      this._wrap(
        moduleExports.OpenAI.Chat.Completions.prototype,
        "create",
        this.patchOpenAI("chat"),
      );
      this._wrap(
        moduleExports.OpenAI.Completions.prototype,
        "create",
        this.patchOpenAI("completion"),
      );
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
    }
  }

  private patchOpenAI(
    type: "chat" | "completion",
    version: "v3" | "v4" = "v4",
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
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
      [SpanAttributes.LLM_SYSTEM]: "OpenAI",
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
          params.functions?.forEach((func, index) => {
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`
            ] = func.name;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`
            ] = func.description;
            attributes[
              `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.arguments`
            ] = JSON.stringify(func.parameters);
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

    return this.tracer.startSpan(`openai.${type}`, {
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
              refusal: null,
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
              result.choices[0].message.tool_calls[toolCall.index].type +=
                toolCall.type;
            }
            if (toolCall.function?.name) {
              result.choices[0].message.tool_calls[
                toolCall.index
              ].function.name += toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              result.choices[0].message.tool_calls[
                toolCall.index
              ].function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      if (result.choices[0].logprobs?.content) {
        this._addLogProbsEvent(span, result.choices[0].logprobs);
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
            finish_reason: "stop",
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
    type: "chat" | "completion",
    version: "v3" | "v4",
    span: Span,
    promise: APIPromise<T>,
  ): APIPromise<T> {
    return promise._thenUnwrap((result) => {
      if (version === "v3") {
        if (type === "chat") {
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
        if (type === "chat") {
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
              choice.finish_reason,
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              choice.message.role,
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              choice.message.content ?? "",
            );

            if (choice.message.function_call) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.name`,
                choice.message.function_call.name,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.arguments`,
                choice.message.function_call.arguments,
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
              choice.finish_reason,
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              "assistant",
            );
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              choice.text,
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
          const logprob = completionLogprobs.token_logprobs?.at(index);
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
}
