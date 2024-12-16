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
import type * as azure from "@azure/openai";
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
import { AzureOpenAIInstrumentationConfig } from "./types";
import type {
  ChatCompletions,
  ChatRequestAssistantMessage,
  ChatRequestMessage,
  ChatRequestSystemMessage,
  ChatRequestToolMessage,
  ChatRequestUserMessage,
  Completions,
} from "@azure/openai";
import { version } from "../package.json";

export class AzureOpenAIInstrumentation extends InstrumentationBase {
  declare protected _config: AzureOpenAIInstrumentationConfig;

  constructor(config: AzureOpenAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-azure", version, config);
  }

  public override setConfig(config: AzureOpenAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof azure) {
    this._diag.debug(`Patching @azure/openai manually`);

    this._wrap(
      module.OpenAIClient.prototype,
      "getChatCompletions",
      this.patchOpenAI("chat"),
    );

    this._wrap(
      module.OpenAIClient.prototype,
      "getCompletions",
      this.patchOpenAI("completion"),
    );
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "@azure/openai",
      [">=1.0.0-beta.1"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof azure, moduleVersion?: string) {
    this._diag.debug(`Patching @azure/openai@${moduleVersion}`);

    this._wrap(
      moduleExports.OpenAIClient.prototype,
      "getChatCompletions",
      this.patchOpenAI("chat"),
    );
    this._wrap(
      moduleExports.OpenAIClient.prototype,
      "getCompletions",
      this.patchOpenAI("completion"),
    );
    return moduleExports;
  }

  private unpatch(moduleExports: typeof azure, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @azure/openai@${moduleVersion}`);

    this._unwrap(moduleExports.OpenAIClient.prototype, "getChatCompletions");
    this._unwrap(moduleExports.OpenAIClient.prototype, "getCompletions");
  }

  private patchOpenAI(type: "chat" | "completion") {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const deployment = args[0] as string;
        const span =
          type === "chat"
            ? plugin.startSpan({
                type,
                deployment,
                params: args[1] as ChatRequestMessage[] & {
                  extraAttributes?: Record<string, any>;
                },
              })
            : plugin.startSpan({
                type,
                deployment,
                params: args[0] as string[] & {
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
              plugin._diag.error("Error in Azure OpenAI instrumentation", e);
            }
          },
        );

        const wrappedPromise = plugin._wrapPromise(
          type,
          deployment,
          span,
          execPromise,
        );

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private startSpan({
    type,
    deployment,
    params,
  }:
    | {
        type: "chat";
        deployment: string;
        params: ChatRequestMessage[] & {
          extraAttributes?: Record<string, any>;
        };
      }
    | {
        type: "completion";
        deployment: string;
        params: string[] & {
          extraAttributes?: Record<string, any>;
        };
      }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_SYSTEM]: "Azure OpenAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: type,
    };

    try {
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = deployment;

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
          params.forEach((message, index) => {
            let content: string | undefined;

            switch (message.role) {
              case "user":
                content = (message as ChatRequestUserMessage).content as string;
                break;
              case "assistant":
                content = (message as ChatRequestAssistantMessage)
                  .content as string;
                break;
              case "system":
                content = (message as ChatRequestSystemMessage)
                  .content as string;
                break;
              case "tool":
                content = (message as ChatRequestToolMessage).content as string;
                break;
              default:
                content = JSON.stringify(message);
                break;
            }

            if (content) {
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
                message.role;
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
                content;
            }
          });
        } else {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          if (typeof params === "string") {
            attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = params;
          } else {
            params.forEach((prompt, index) => {
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
                "user";

              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
                prompt;
            });
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

  private _wrapPromise<T>(
    type: "chat" | "completion",
    deployment: string,
    span: Span,
    promise: Promise<T>,
  ): Promise<T> {
    return promise
      .then((result) => {
        return new Promise<T>((resolve) => {
          if (type === "chat") {
            this._endSpan({
              type,
              deployment,
              span,
              result: result as ChatCompletions,
            });
          } else {
            this._endSpan({
              type,
              deployment,
              span,
              result: result as Completions,
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
    deployment,
    type,
    result,
  }:
    | { span: Span; deployment: string; type: "chat"; result: ChatCompletions }
    | {
        span: Span;
        deployment: string;
        type: "completion";
        result: Completions;
      }) {
    try {
      span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, deployment);
      if (result.usage) {
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.usage?.totalTokens,
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          result.usage?.completionTokens,
        );
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          result.usage?.promptTokens,
        );
      }

      if (this._shouldSendPrompts()) {
        if (type === "chat") {
          result.choices.forEach((choice, index) => {
            if (choice.finishReason) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
                choice.finishReason,
              );
            }
            if (choice.message) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
                choice.message.role,
              );
              if (choice.message.content) {
                span.setAttribute(
                  `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
                  choice.message.content,
                );
              }
            }

            if (choice.message?.functionCall) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.name`,
                choice.message.functionCall.name,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.function_call.arguments`,
                choice.message.functionCall.arguments,
              );
            }
          });
        } else {
          result.choices.forEach((choice, index) => {
            if (choice.finishReason) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
                choice.finishReason,
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
                "assistant",
              );
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
                choice.text,
              );
            }
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
}
