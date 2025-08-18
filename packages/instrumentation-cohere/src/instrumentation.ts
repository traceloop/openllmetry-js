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
import type * as cohere from "cohere-ai";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  LLMRequestTypeValues,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import { version } from "../package.json";

type LLM_COMPLETION_TYPE = "chat" | "completion" | "rerank";
export class CohereInstrumentation extends InstrumentationBase {
  declare protected _config: CohereInstrumentationConfig;

  constructor(config: CohereInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-cohere", version, config);
  }

  public override setConfig(config: CohereInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "cohere-ai",
      [">=7.7.5"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return module;
  }

  public manuallyInstrument(module: typeof cohere) {
    this._diag.debug(`Manually patching cohere-ai`);
    this.wrap(module);
  }

  private wrap(module: typeof cohere, moduleVersion?: string) {
    this._diag.debug(`Patching cohere-ai@${moduleVersion}`);

    this._wrap(
      module.CohereClient.prototype,
      "generate",
      this.wrapperMethod("completion", false),
    );
    this._wrap(
      module.CohereClient.prototype,
      "generateStream",
      this.wrapperMethod("completion", true),
    );
    this._wrap(
      module.CohereClient.prototype,
      "chat",
      this.wrapperMethod("chat", false),
    );
    this._wrap(
      module.CohereClient.prototype,
      "chatStream",
      this.wrapperMethod("chat", true),
    );
    this._wrap(
      module.CohereClient.prototype,
      "rerank",
      this.wrapperMethod("rerank", false),
    );

    return module;
  }

  private unwrap(module: typeof cohere, moduleVersion?: string) {
    this._diag.debug(`Unpatching @cohere-ai@${moduleVersion}`);

    this._unwrap(module.CohereClient.prototype, "generateStream");
    this._unwrap(module.CohereClient.prototype, "chat");
    this._unwrap(module.CohereClient.prototype, "chatStream");
    this._unwrap(module.CohereClient.prototype, "rerank");
  }

  private wrapperMethod(type: LLM_COMPLETION_TYPE, streaming: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: any) {
        const span = plugin._startSpan({
          params: args[0],
          type,
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
              plugin._diag.error("Error in cohere instrumentation", e);
            }
          },
        );
        const wrappedPromise = plugin._wrapPromise(
          type,
          streaming,
          span,
          execPromise,
        );
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _wrapPromise<T>(
    type: LLM_COMPLETION_TYPE,
    streaming: boolean,
    span: Span,
    promise: Promise<T>,
  ): Promise<T> {
    return promise
      .then(async (result) => {
        const awaitedResult = await result;
        if (type === "completion" && streaming) {
          await this._endSpan({
            type,
            span,
            streaming,
            result:
              (await awaitedResult) as AsyncIterable<cohere.Cohere.GenerateStreamedResponse>,
          });
        } else if (type === "completion" && !streaming) {
          await this._endSpan({
            type,
            span,
            streaming,
            result: awaitedResult as cohere.Cohere.Generation,
          });
        } else if (type === "chat" && streaming) {
          await this._endSpan({
            type,
            span,
            streaming,
            result:
              (await awaitedResult) as AsyncIterable<cohere.Cohere.StreamedChatResponse>,
          });
        } else if (type === "chat" && !streaming) {
          await this._endSpan({
            type,
            span,
            streaming,
            result: awaitedResult as cohere.Cohere.NonStreamedChatResponse,
          });
        } else if (type === "rerank" && !streaming) {
          await this._endSpan({
            type,
            span,
            streaming,
            result: awaitedResult as cohere.Cohere.RerankResponse,
          });
        }

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
    type,
  }: {
    params:
      | cohere.Cohere.GenerateRequest
      | cohere.Cohere.GenerateStreamRequest
      | cohere.Cohere.ChatRequest
      | cohere.Cohere.ChatStreamRequest
      | cohere.Cohere.RerankRequest;
    type: LLM_COMPLETION_TYPE;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_SYSTEM]: "Cohere",
      [SpanAttributes.LLM_REQUEST_TYPE]: this._getLlmRequestTypeByMethod(type),
    };

    try {
      const model = params.model ?? "command";
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = model;
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = model;

      if (!("query" in params)) {
        attributes[SpanAttributes.LLM_REQUEST_TOP_P] = params.p;
        attributes[SpanAttributes.LLM_TOP_K] = params.k;
        attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE] = params.temperature;
        attributes[SpanAttributes.LLM_FREQUENCY_PENALTY] =
          params.frequencyPenalty;
        attributes[SpanAttributes.LLM_PRESENCE_PENALTY] =
          params.presencePenalty;
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] = params.maxTokens;
      } else {
        attributes["topN"] = params["topN"];
        attributes["maxChunksPerDoc"] = params["maxChunksPerDoc"];
      }

      if (this._shouldSendPrompts()) {
        if (type === "completion" && "prompt" in params) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`] = params.prompt;
        } else if (type === "chat" && "message" in params) {
          params.chatHistory?.forEach((msg, index) => {
            attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] =
              msg.role;
            if (msg.role !== "TOOL") {
              attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
                msg.message;
            }
          });

          attributes[
            `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.role`
          ] = "user";
          attributes[
            `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.user`
          ] = params.message;
        } else if (type === "rerank" && "query" in params) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`] = params.query;
          params.documents.forEach((doc, index) => {
            attributes[`documents.${index}.index`] =
              typeof doc === "string" ? doc : doc.text;
          });
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`cohere.${type}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private async _endSpan({
    type,
    span,
    streaming,
    result,
  }:
    | {
        type: "completion";
        span: Span;
        streaming: false;
        result: cohere.Cohere.Generation;
      }
    | {
        type: "completion";
        span: Span;
        streaming: true;
        result: AsyncIterable<cohere.Cohere.GenerateStreamedResponse>;
      }
    | {
        type: "chat";
        span: Span;
        streaming: false;
        result: cohere.Cohere.NonStreamedChatResponse;
      }
    | {
        type: "chat";
        span: Span;
        streaming: true;
        result: AsyncIterable<cohere.Cohere.StreamedChatResponse>;
      }
    | {
        type: "rerank";
        span: Span;
        streaming: false;
        result: cohere.Cohere.RerankResponse;
      }) {
    if (type === "completion") {
      if (streaming) {
        for await (const message of result) {
          if (message.eventType === "stream-end") {
            this._setResponseSpanForGenerate(span, message.response);
          }
        }
      } else if ("generations" in result) {
        this._setResponseSpanForGenerate(span, result);
      }
    } else if (type === "chat") {
      if (streaming) {
        for await (const message of result) {
          if (message.eventType === "stream-end") {
            this._setResponseSpanForChat(span, message.response);
          }
        }
      } else if ("text" in result) {
        this._setResponseSpanForChat(
          span,
          result as cohere.Cohere.NonStreamedChatResponse,
        );
      }
    } else if (type === "rerank") {
      if ("results" in result) {
        this._setResponseSpanForRerank(span, result);
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _setResponseSpanForRerank(
    span: Span,
    result: cohere.Cohere.RerankResponse,
  ) {
    try {
      if ("meta" in result) {
        if (result.meta?.billedUnits?.searchUnits !== undefined) {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
            result.meta?.billedUnits?.searchUnits,
          );
        }

        if (this._shouldSendPrompts()) {
          result.results.forEach((each, idx) => {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${idx}.relevanceScore`,
              each.relevanceScore,
            );

            if (each.document && each.document?.text) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${idx}.content`,
                each.document.text,
              );
            }
          });
        } else {
          result.results.forEach((each, idx) => {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${idx}.content`,
              each.index,
            );

            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${idx}.relevanceScore`,
              each.relevanceScore,
            );
          });
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }
  }

  private _setResponseSpanForChat(
    span: Span,
    result: cohere.Cohere.NonStreamedChatResponse,
  ) {
    try {
      if ("token_count" in result && typeof result.token_count === "object") {
        if (
          result.token_count &&
          "prompt_tokens" in result.token_count &&
          typeof result.token_count.prompt_tokens === "number"
        ) {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
            result.token_count?.prompt_tokens,
          );
        }

        if (
          result.token_count &&
          "response_tokens" in result.token_count &&
          typeof result.token_count.response_tokens === "number"
        ) {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
            result.token_count?.response_tokens,
          );
        }

        if (
          result.token_count &&
          "total_tokens" in result.token_count &&
          typeof result.token_count.total_tokens === "number"
        ) {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
            result.token_count?.total_tokens,
          );
        }
      }

      if (this._shouldSendPrompts()) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
          "assistant",
        );
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
          result.text,
        );

        if (result.searchQueries?.[0].text) {
          span.setAttribute(
            `${SpanAttributes.LLM_COMPLETIONS}.0.searchQuery`,
            result.searchQueries?.[0].text,
          );
        }

        if (result.searchResults?.length) {
          result.searchResults.forEach((searchResult, index) => {
            if (searchResult.searchQuery) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.0.searchResult.${index}.text`,
                searchResult.searchQuery.text,
              );
            }
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.0.searchResult.${index}.connector`,
              searchResult.connector.id,
            );
          });
        }
      }

      if ("finishReason" in result && typeof result.finishReason === "string") {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
          result.finishReason,
        );
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }
  }

  private _setResponseSpanForGenerate(
    span: Span,
    result: cohere.Cohere.Generation | cohere.Cohere.GenerateStreamEndResponse,
  ) {
    try {
      if (result && "meta" in result) {
        if (typeof result.meta?.billedUnits?.inputTokens === "number") {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
            result.meta?.billedUnits?.inputTokens,
          );
        }

        if (typeof result.meta?.billedUnits?.outputTokens === "number") {
          span.setAttribute(
            SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
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

      if (this._shouldSendPrompts() && result.generations) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.role`,
          "assistant",
        );
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.content`,
          result.generations[0].text,
        );
      }

      if (
        result.generations &&
        "finish_reason" in result.generations[0] &&
        typeof result.generations[0].finish_reason === "string"
      ) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
          result.generations[0].finish_reason,
        );
      }

      if (
        result.generations &&
        "finishReason" in result.generations[0] &&
        typeof result.generations[0].finishReason === "string"
      ) {
        span.setAttribute(
          `${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`,
          result.generations[0].finishReason,
        );
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }
  }

  private _getLlmRequestTypeByMethod(type: string) {
    if (type === "chat") return LLMRequestTypeValues.CHAT;
    else if (type === "completion") return LLMRequestTypeValues.COMPLETION;
    else if (type === "rerank") return LLMRequestTypeValues.RERANK;
    else return LLMRequestTypeValues.UNKNOWN;
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
