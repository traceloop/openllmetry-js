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
  FinishReasons,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import {
  formatInputMessages,
  formatInputMessagesFromPrompt,
  formatOutputMessage,
} from "@traceloop/instrumentation-utils";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
} from "@opentelemetry/semantic-conventions/incubating";
import { version } from "../package.json";

// Operation name for reranking (not yet in OTel 1.40 spec, use literal)
const GEN_AI_OPERATION_NAME_VALUE_RERANK = "rerank";

type LLM_COMPLETION_TYPE =
  | typeof GEN_AI_OPERATION_NAME_VALUE_CHAT
  | typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION
  | typeof GEN_AI_OPERATION_NAME_VALUE_RERANK;

// Map Cohere finish reasons to OTel standard finish reasons
const cohereFinishReasonMap: Record<string, string> = {
  COMPLETE: FinishReasons.STOP,
  MAX_TOKENS: FinishReasons.LENGTH,
  STOP_SEQUENCE: FinishReasons.STOP,
  TOOL_USE: FinishReasons.TOOL_CALL,
  ERROR: FinishReasons.ERROR,
  // generate API uses lowercase
  COMPLETE_lower: FinishReasons.STOP,
  // Some responses use these values
  stop: FinishReasons.STOP,
  max_tokens: FinishReasons.LENGTH,
};

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
      this.wrapperMethod(GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION, false),
    );
    this._wrap(
      module.CohereClient.prototype,
      "generateStream",
      this.wrapperMethod(GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION, true),
    );
    this._wrap(
      module.CohereClient.prototype,
      "chat",
      this.wrapperMethod(GEN_AI_OPERATION_NAME_VALUE_CHAT, false),
    );
    this._wrap(
      module.CohereClient.prototype,
      "chatStream",
      this.wrapperMethod(GEN_AI_OPERATION_NAME_VALUE_CHAT, true),
    );
    this._wrap(
      module.CohereClient.prototype,
      "rerank",
      this.wrapperMethod(GEN_AI_OPERATION_NAME_VALUE_RERANK, false),
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
        if (
          type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION &&
          streaming
        ) {
          await this._endSpan({
            type,
            span,
            streaming,
            result:
              (await awaitedResult) as AsyncIterable<cohere.Cohere.GenerateStreamedResponse>,
          });
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION &&
          !streaming
        ) {
          await this._endSpan({
            type,
            span,
            streaming,
            result: awaitedResult as cohere.Cohere.Generation,
          });
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_CHAT &&
          streaming
        ) {
          await this._endSpan({
            type,
            span,
            streaming,
            result:
              (await awaitedResult) as AsyncIterable<cohere.Cohere.StreamedChatResponse>,
          });
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_CHAT &&
          !streaming
        ) {
          await this._endSpan({
            type,
            span,
            streaming,
            result: awaitedResult as cohere.Cohere.NonStreamedChatResponse,
          });
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_RERANK &&
          !streaming
        ) {
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
    const model = params.model ?? "command";

    const attributes: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_COHERE,
      [ATTR_GEN_AI_OPERATION_NAME]: type,
      [ATTR_GEN_AI_REQUEST_MODEL]: model,
    };

    try {
      if (!("query" in params)) {
        attributes[ATTR_GEN_AI_REQUEST_TOP_P] = params.p;
        attributes[ATTR_GEN_AI_REQUEST_TOP_K] = params.k;
        attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
        attributes[SpanAttributes.LLM_FREQUENCY_PENALTY] =
          params.frequencyPenalty;
        attributes[SpanAttributes.LLM_PRESENCE_PENALTY] =
          params.presencePenalty;
        attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.maxTokens;
      } else {
        attributes["topN"] = params["topN"];
        attributes["maxChunksPerDoc"] = params["maxChunksPerDoc"];
      }

      if (this._shouldSendPrompts()) {
        if (
          type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION &&
          "prompt" in params
        ) {
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            formatInputMessagesFromPrompt(params.prompt as string);
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_CHAT &&
          "message" in params
        ) {
          const messages = [
            ...(params.chatHistory ?? []).map((msg) => ({
              role: msg.role.toLowerCase(),
              content: "message" in msg ? (msg.message ?? "") : "",
            })),
            { role: "user", content: params.message },
          ];
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] = formatInputMessages(
            messages,
            (block: unknown) => ({ type: "text", content: block }),
          );
        } else if (
          type === GEN_AI_OPERATION_NAME_VALUE_RERANK &&
          "query" in params
        ) {
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            formatInputMessagesFromPrompt(params.query);
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

    return this.tracer.startSpan(`${type} ${model}`, {
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
        type: typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
        span: Span;
        streaming: false;
        result: cohere.Cohere.Generation;
      }
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;
        span: Span;
        streaming: true;
        result: AsyncIterable<cohere.Cohere.GenerateStreamedResponse>;
      }
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_CHAT;
        span: Span;
        streaming: false;
        result: cohere.Cohere.NonStreamedChatResponse;
      }
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_CHAT;
        span: Span;
        streaming: true;
        result: AsyncIterable<cohere.Cohere.StreamedChatResponse>;
      }
    | {
        type: typeof GEN_AI_OPERATION_NAME_VALUE_RERANK;
        span: Span;
        streaming: false;
        result: cohere.Cohere.RerankResponse;
      }) {
    if (type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION) {
      if (streaming) {
        for await (const message of result) {
          if (message.eventType === "stream-end") {
            this._setResponseSpanForGenerate(span, message.response);
          }
        }
      } else if ("generations" in result) {
        this._setResponseSpanForGenerate(span, result);
      }
    } else if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT) {
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
    } else if (type === GEN_AI_OPERATION_NAME_VALUE_RERANK) {
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
            SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
            result.meta?.billedUnits?.searchUnits,
          );
        }

        if (this._shouldSendPrompts()) {
          const outputParts = result.results.map((each) => ({
            relevanceScore: each.relevanceScore,
            content: each.document?.text ?? each.index.toString(),
          }));
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            JSON.stringify([{ role: "assistant", parts: outputParts }]),
          );
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
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            result.token_count.prompt_tokens,
          );
        }

        if (
          result.token_count &&
          "response_tokens" in result.token_count &&
          typeof result.token_count.response_tokens === "number"
        ) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            result.token_count.response_tokens,
          );
        }

        if (
          result.token_count &&
          "total_tokens" in result.token_count &&
          typeof result.token_count.total_tokens === "number"
        ) {
          span.setAttribute(
            SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
            result.token_count.total_tokens,
          );
        }
      }

      const finishReason =
        "finishReason" in result && typeof result.finishReason === "string"
          ? result.finishReason
          : null;

      if (finishReason) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
          cohereFinishReasonMap[finishReason] ?? finishReason,
        ]);
      }

      if (this._shouldSendPrompts()) {
        span.setAttribute(
          ATTR_GEN_AI_OUTPUT_MESSAGES,
          formatOutputMessage(
            result.text,
            finishReason,
            cohereFinishReasonMap,
            GEN_AI_OPERATION_NAME_VALUE_CHAT,
            (block: unknown) => ({ type: "text", content: block }),
            true,
          ),
        );
      }

      if (
        "responseId" in result &&
        typeof result.responseId === "string"
      ) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, result.responseId);
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
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            result.meta.billedUnits.inputTokens,
          );
        }

        if (typeof result.meta?.billedUnits?.outputTokens === "number") {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            result.meta.billedUnits.outputTokens,
          );
        }

        if (
          typeof result.meta?.billedUnits?.inputTokens === "number" &&
          typeof result.meta?.billedUnits?.outputTokens === "number"
        ) {
          span.setAttribute(
            SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
            result.meta.billedUnits.inputTokens +
              result.meta.billedUnits.outputTokens,
          );
        }
      }

      const finishReason =
        result.generations &&
        result.generations[0] &&
        (("finish_reason" in result.generations[0] &&
          typeof result.generations[0].finish_reason === "string" &&
          result.generations[0].finish_reason) ||
          ("finishReason" in result.generations[0] &&
            typeof result.generations[0].finishReason === "string" &&
            result.generations[0].finishReason))
          ? (result.generations[0] as any).finish_reason ??
            (result.generations[0] as any).finishReason
          : null;

      if (finishReason) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
          cohereFinishReasonMap[finishReason] ?? finishReason,
        ]);
      }

      if (this._shouldSendPrompts() && result.generations) {
        span.setAttribute(
          ATTR_GEN_AI_OUTPUT_MESSAGES,
          formatOutputMessage(
            result.generations[0].text,
            finishReason,
            cohereFinishReasonMap,
            GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
            (block: unknown) => ({ type: "text", content: block }),
            true,
          ),
        );
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
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
