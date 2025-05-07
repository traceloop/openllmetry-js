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
  context,
  trace,
  Span,
  Attributes,
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
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
import { CerebrasInstrumentationConfig } from "./types";
import { version } from "../package.json";
import type * as cerebras from "@cerebras/cerebras_cloud_sdk";
import type {
  CompletionCreateParamsNonStreaming,
  CompletionCreateParamsStreaming,
  Completion,
} from "@cerebras/cerebras_cloud_sdk/resources/completions";
import type { Stream } from "@cerebras/cerebras_cloud_sdk/streaming";
import {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "@cerebras/cerebras_cloud_sdk/resources/chat/completions";

export class CerebrasInstrumentation extends InstrumentationBase {
  declare protected _config: CerebrasInstrumentationConfig;

  constructor(config: CerebrasInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-cerebras", version, config);
  }

  public override setConfig(config: CerebrasInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof cerebras) {
    this._diag.debug(`Patching @cerebras/cerebras_cloud_sdk manually`);

    this._wrap(
      module.Cerebras.Completions.prototype,
      "create",
      this.patchCerebras("completion"),
    );
    this._wrap(
      module.Cerebras.Chat.Completions.prototype,
      "create",
      this.patchCerebras("chat"),
    );
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "@cerebras/cerebras_cloud_sdk",
      [">=0.9.1"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof cerebras, moduleVersion?: string) {
    this._diag.debug(`Patching  @cerebras/cerebras_cloud_sdk@${moduleVersion}`);

    this._wrap(
      moduleExports.Cerebras.Completions.prototype,
      "create",
      this.patchCerebras("completion"),
    );
    this._wrap(
      moduleExports.Cerebras.Chat.Completions.prototype,
      "create",
      this.patchCerebras("chat"),
    );
    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof cerebras,
    moduleVersion?: string,
  ): void {
    this._diag.debug(
      `Unpatching @cerebras/cerebras_cloud_sdk@${moduleVersion}`,
    );

    this._unwrap(moduleExports.Cerebras.Completions.prototype, "create");
    this._unwrap(moduleExports.Cerebras.Chat.Completions.prototype, "create");
  }

  private patchCerebras(type: "chat" | "completion") {
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
              plugin._diag.error("Error in Cerebras instrumentation", e);
            }
          },
        );

        if (
          (
            args[0] as
              | ChatCompletionCreateParamsNonStreaming
              | CompletionCreateParamsStreaming
          ).stream
        ) {
          return context.bind(
            execContext,
            plugin._streamingWrapPromise({
              span,
              type,
              promise: execPromise,
            }),
          );
        }

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
      [SpanAttributes.LLM_SYSTEM]: "Cerebras",
      [SpanAttributes.LLM_REQUEST_TYPE]: type,
    };

    try {
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
      if (typeof params.temperature === "number") {
        attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE] = params.temperature;
      }
      if (typeof params.top_p === "number") {
        attributes[SpanAttributes.LLM_REQUEST_TOP_P] = params.top_p;
      }

      if (typeof params.max_tokens === "number") {
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] = params.max_tokens;
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
        } else {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
            params.prompt as string;
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`cerebras.${type}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private async *_streamingWrapPromise({
    span,
    type,
    promise,
  }:
    | {
        span: Span;
        type: "chat";
        promise: Promise<Stream<ChatCompletion>>;
      }
    | {
        span: Span;
        type: "completion";
        promise: Promise<Stream<Completion>>;
      }) {
    if (type === "chat") {
      const message: ChatCompletion.ChatCompletionResponse.Choice.Message = {
        id: "0",
        type: "message",
        role: "assistant",
        stop_reason: null,
        stop_sequence: null,
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        content: "",
      };

      const result: ChatCompletion.ChatCompletionResponse = {
        id: "0",
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message,
          },
        ],
        created: 0,
        model: "",
        object: "chat.completion",
        system_fingerprint: "",
        time_info: {},
        usage: {},
      };

      for await (const chunk of await promise) {
        yield chunk;

        if (!("error" in chunk)) {
          try {
            const text =
              (chunk as ChatCompletion.ChatChunkResponse).choices?.[0]?.delta
                ?.content || "";
            message.content += text;
          } catch (e) {
            this._diag.debug(e);
            this._config.exceptionLogger?.(e);
          }

          if (chunk.usage) {
            result.usage = chunk.usage;
          }
          if (chunk.model) {
            result.model = chunk.model;
          }
          if (chunk.finish_reason) {
            message.finish_reason = chunk.finish_reason as
              | "stop"
              | "length"
              | "content_filter"
              | null;
          }
        }
      }

      this._endSpan({ span, type, result });
    } else {
      const result: Completion.CompletionResponse = {
        id: "0",
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            text: "",
          },
        ],
        created: 0,
        model: "",
        object: "text_completion",
        system_fingerprint: "",
        time_info: {},
        usage: {},
      };

      for await (const chunk of await promise) {
        yield chunk;

        if (!("error" in chunk)) {
          try {
            const text =
              (chunk as Completion.CompletionResponse).choices?.[0]?.text || "";
            result.choices[0].text += text;
          } catch (e) {
            this._diag.debug(e);
            this._config.exceptionLogger?.(e);
          }

          if (chunk.usage) {
            result.usage = chunk.usage;
          }
          if (chunk.model) {
            result.model = chunk.model;
          }
          if (chunk.finish_reason) {
            result.choices[0].finish_reason = chunk.finish_reason as
              | "stop"
              | "length"
              | "content_filter"
              | null;
          }
        }
      }

      this._endSpan({ span, type, result });
    }
  }

  private _wrapPromise<T>(
    type: "chat" | "completion",
    span: Span,
    promise: Promise<T>,
  ): Promise<T> {
    return promise
      .then((result) => {
        return new Promise<T>((resolve) => {
          if (type === "chat") {
            this._endSpan({
              type,
              span,
              result: result as ChatCompletion.ChatCompletionResponse,
            });
          } else {
            this._endSpan({
              type,
              span,
              result: result as Completion.CompletionResponse,
            });
          }

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

  private _endSpan({
    span,
    type,
    result,
  }:
    | {
        span: Span;
        type: "chat";
        result: ChatCompletion.ChatCompletionResponse;
      }
    | {
        span: Span;
        type: "completion";
        result: Completion.CompletionResponse;
      }) {
    try {
      span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, result.model);

      if (result.usage) {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          ((result.usage.prompt_tokens as number | undefined) ?? 0) +
            ((result.usage.completion_tokens as number | undefined) ?? 0),
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          (result.usage.completion_tokens as number | undefined) ?? 0,
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          (result.usage.prompt_tokens as number | undefined) ?? 0,
        );
      }

      if (result.choices?.[0]?.finish_reason) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
          result.choices[0].finish_reason,
        );
      }

      if (this._shouldSendPrompts()) {
        if (type === "chat") {
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
            "assistant",
          );
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
            result.choices[0].message.content as string,
          );
        } else {
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
            "assistant",
          );
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
            result.choices[0].text || "",
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
}
