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
import { VertexAIInstrumentationConfig } from "./types";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import type * as vertexAI from "@google-cloud/vertexai";
import { version } from "../package.json";

export class VertexAIInstrumentation extends InstrumentationBase<any> {
  protected declare _config: VertexAIInstrumentationConfig;

  constructor(config: VertexAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-vertexai", version, config);
  }

  public override setConfig(config: VertexAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any> {
    const vertexAIModule = new InstrumentationNodeModuleDefinition<any>(
      "@google-cloud/vertexai",
      [">=0.2.1"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return vertexAIModule;
  }

  private modelConfig: vertexAI.ModelParams = { model: "" };

  private setModel(newValue: vertexAI.ModelParams) {
    this.modelConfig = { ...newValue };
  }

  public manuallyInstrument(module: typeof vertexAI) {
    this._diag.debug("Manually instrumenting @google-cloud/vertexai");

    this._wrap(
      module.VertexAI_Preview.prototype,
      "getGenerativeModel",
      this.wrapperMethod("getGenerativeModel"),
    );
    this._wrap(
      module.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethod("generateContentStream"),
    );
  }

  private wrap(module: typeof vertexAI, moduleVersion?: string) {
    this._diag.debug(`Patching @google-cloud/vertexai@${moduleVersion}`);

    this._wrap(
      module.VertexAI_Preview.prototype,
      "getGenerativeModel",
      this.wrapperMethod("getGenerativeModel"),
    );
    this._wrap(
      module.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethod("generateContentStream"),
    );

    return module;
  }

  private unwrap(module: typeof vertexAI, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @google-cloud/vertexai@${moduleVersion}`);

    this._unwrap(module.VertexAI_Preview.prototype, "getGenerativeModel");
    this._unwrap(module.GenerativeModel.prototype, "generateContentStream");
  }

  private wrapperMethod(
    wrappedMethodName: "getGenerativeModel" | "generateContentStream",
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(
        this: any,
        ...args: (vertexAI.GenerateContentRequest & vertexAI.ModelParams)[]
      ) {
        if (wrappedMethodName === "getGenerativeModel") {
          plugin.setModel(args[0]);

          return context.bind(
            context.active(),
            safeExecuteInTheMiddle(
              () => {
                return context.with(context.active(), () => {
                  return original.apply(this, args);
                });
              },
              (e) => {
                if (e) {
                  plugin._diag.error("Error in VertexAI Instrumentation", e);
                }
              },
            ),
          );
        }

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
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {},
        );

        const wrappedPromise = plugin._wrapPromise(span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _startSpan({
    params,
  }: {
    params: vertexAI.GenerateContentRequest;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_VENDOR]: "VertexAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
    };

    try {
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = this.modelConfig.model;

      if (
        this.modelConfig.generation_config !== undefined &&
        typeof this.modelConfig.generation_config === "object"
      ) {
        if (this.modelConfig.generation_config.max_output_tokens) {
          attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
            this.modelConfig.generation_config.max_output_tokens;
        }
        if (this.modelConfig.generation_config.temperature) {
          attributes[SpanAttributes.LLM_TEMPERATURE] =
            this.modelConfig.generation_config.temperature;
        }
        if (this.modelConfig.generation_config.top_p) {
          attributes[SpanAttributes.LLM_TOP_P] =
            this.modelConfig.generation_config.top_p;
        }
        if (this.modelConfig.generation_config.top_k) {
          attributes[SpanAttributes.LLM_TOP_K] =
            this.modelConfig.generation_config.top_k;
        }
      }

      if (this._shouldSendPrompts() && "contents" in params) {
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] =
          params.contents[0].role ?? "user";
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
          this._formatPartsData(params.contents[0].parts);
      }
    } catch (e) {
      this._diag.warn(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`vertexai.completion`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then(async (result) => {
        await this._endSpan({
          span,
          result: result as vertexAI.StreamGenerateContentResult,
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

  private async _endSpan({
    span,
    result,
  }: {
    span: Span;
    result: vertexAI.StreamGenerateContentResult;
  }) {
    try {
      span.setAttribute(
        SpanAttributes.LLM_RESPONSE_MODEL,
        this.modelConfig.model,
      );

      const streamResponse = await result.response;

      if (streamResponse.usageMetadata?.totalTokenCount !== undefined)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          streamResponse.usageMetadata.totalTokenCount,
        );

      if (streamResponse.usageMetadata?.candidates_token_count)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          streamResponse.usageMetadata.candidates_token_count,
        );

      if (streamResponse.usageMetadata?.prompt_token_count)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          streamResponse.usageMetadata.prompt_token_count,
        );

      if (this._shouldSendPrompts()) {
        streamResponse.candidates.forEach((candidate, index) => {
          if (candidate.finishReason)
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.finish_reason`,
              candidate.finishReason,
            );

          if (candidate.content) {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              candidate.content.role ?? "assistant",
            );

            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              this._formatPartsData(candidate.content.parts),
            );
          }
        });
      }
    } catch (e) {
      this._diag.warn(e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _formatPartsData(parts: vertexAI.Part[]): string {
    const result = parts
      .map((part) => {
        if (part.text) return part.text;
        else if (part.file_data)
          return part.file_data.file_uri + "-" + part.file_data.mime_type;
        else if (part.inline_data)
          return part.inline_data.data + "-" + part.inline_data.mime_type;
        else return "";
      })
      .filter(Boolean);

    return result.join("\n");
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
