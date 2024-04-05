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
import * as anthropic from "@anthropic-ai/sdk";
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
import { AnthropicInstrumentationConfig } from "./types";
import type {
  CompletionCreateParamsNonStreaming,
  Completion,
} from "@anthropic-ai/sdk/resources/completions";
import type {
  MessageCreateParamsNonStreaming,
  Message,
} from "@anthropic-ai/sdk/resources/messages";
import { version } from "../package.json";

export class AnthropicInstrumentation extends InstrumentationBase<any> {
  protected declare _config: AnthropicInstrumentationConfig;

  constructor(config: AnthropicInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-anthropic", version, config);
  }

  public override setConfig(config: AnthropicInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof anthropic) {
    this._diag.debug(`Patching @anthropic-ai/sdk manually`);

    this._wrap(
      module.Anthropic.Completions.prototype,
      "create",
      this.patchAnthropic("completion"),
    );
    this._wrap(
      module.Anthropic.Messages.prototype,
      "create",
      this.patchAnthropic("chat"),
    );
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const module = new InstrumentationNodeModuleDefinition<any>(
      "@anthropic-ai/sdk",
      [">=0.9.1"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof anthropic, moduleVersion?: string) {
    this._diag.debug(`Patching  @anthropic-ai/sdk@${moduleVersion}`);

    this._wrap(
      moduleExports.Anthropic.Completions.prototype,
      "create",
      this.patchAnthropic("completion"),
    );
    this._wrap(
      moduleExports.Anthropic.Messages.prototype,
      "create",
      this.patchAnthropic("chat"),
    );
    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof anthropic,
    moduleVersion?: string,
  ): void {
    this._diag.debug(`Unpatching @azure/openai@${moduleVersion}`);

    this._unwrap(moduleExports.Anthropic.Completions.prototype, "create");
    this._unwrap(moduleExports.Anthropic.Messages.prototype, "create");
  }

  private patchAnthropic(type: "chat" | "completion") {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const span =
          type === "chat"
            ? plugin.startSpan({
                type,
                params: args[0] as MessageCreateParamsNonStreaming & {
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
              plugin._diag.error("Error in Anthropic instrumentation", e);
            }
          },
        );

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
        params: MessageCreateParamsNonStreaming & {
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
      [SpanAttributes.LLM_VENDOR]: "Anthropic",
      [SpanAttributes.LLM_REQUEST_TYPE]: type,
    };

    attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
    attributes[SpanAttributes.LLM_TEMPERATURE] = params.temperature;
    attributes[SpanAttributes.LLM_TOP_P] = params.top_p;
    attributes[SpanAttributes.LLM_TOP_K] = params.top_k;

    if (type === "completion") {
      attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
        params.max_tokens_to_sample;
    } else {
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
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = params.prompt;
      }
    }

    return this.tracer.startSpan(`anthropic.${type}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
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
              result: result as Message,
            });
          } else {
            this._endSpan({
              type,
              span,
              result: result as Completion,
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
    | { span: Span; type: "chat"; result: Message }
    | {
        span: Span;
        type: "completion";
        result: Completion;
      }) {
    span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, result.model);
    if (type === "chat" && result.usage) {
      span.setAttribute(
        SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
        result.usage?.input_tokens + result.usage?.output_tokens,
      );
      span.setAttribute(
        SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
        result.usage?.output_tokens,
      );
      span.setAttribute(
        SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
        result.usage?.input_tokens,
      );
    }

    result.stop_reason &&
      span.setAttribute(
        `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
        result.stop_reason,
      );

    if (this._shouldSendPrompts()) {
      if (type === "chat") {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
          "assistant",
        );
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
          JSON.stringify(result.content),
        );
      } else {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
          "assistant",
        );
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
          result.completion,
        );
      }
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
