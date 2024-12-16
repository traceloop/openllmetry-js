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

export class VertexAIInstrumentation extends InstrumentationBase {
  declare protected _config: VertexAIInstrumentationConfig;

  constructor(config: VertexAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-vertexai", version, config);
  }

  public override setConfig(config: VertexAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const vertexAIModule = new InstrumentationNodeModuleDefinition(
      "@google-cloud/vertexai",
      [">=1.1.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return vertexAIModule;
  }

  public manuallyInstrument(module: typeof vertexAI) {
    this._diag.debug("Manually instrumenting @google-cloud/vertexai");

    this._wrap(
      module.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethod(),
    );
    this._wrap(
      module.GenerativeModel.prototype,
      "generateContent",
      this.wrapperMethod(),
    );
  }

  private wrap(module: typeof vertexAI, moduleVersion?: string) {
    this._diag.debug(`Patching @google-cloud/vertexai@${moduleVersion}`);

    this._wrap(
      module.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethod(),
    );
    this._wrap(
      module.GenerativeModel.prototype,
      "generateContent",
      this.wrapperMethod(),
    );

    return module;
  }

  private unwrap(module: typeof vertexAI, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @google-cloud/vertexai@${moduleVersion}`);

    this._unwrap(module.GenerativeModel.prototype, "generateContentStream");
    this._unwrap(module.GenerativeModel.prototype, "generateContent");
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(
        this: vertexAI.GenerativeModel,
        ...args: (vertexAI.GenerateContentRequest & vertexAI.ModelParams)[]
      ) {
        const span = plugin._startSpan({
          instance: this,
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
    instance,
    params,
  }: {
    instance: vertexAI.GenerativeModel;
    params: vertexAI.GenerateContentRequest;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_SYSTEM]: "VertexAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
    };

    try {
      attributes[SpanAttributes.LLM_REQUEST_MODEL] = instance["model"];
      attributes[SpanAttributes.LLM_RESPONSE_MODEL] = instance["model"];

      if (instance["generationConfig"]) {
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
          instance["generationConfig"].max_output_tokens;
        attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE] =
          instance["generationConfig"].temperature;
        attributes[SpanAttributes.LLM_REQUEST_TOP_P] =
          instance["generationConfig"].top_p;
        attributes[SpanAttributes.LLM_TOP_K] =
          instance["generationConfig"].top_k;
      }

      if (this._shouldSendPrompts() && "contents" in params) {
        let i = 0;

        if (instance["systemInstruction"]) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.${i}.role`] = "system";
          attributes[`${SpanAttributes.LLM_PROMPTS}.${i}.content`] =
            this._formatPartsData(instance["systemInstruction"].parts);

          i++;
        }

        params.contents.forEach((content, j) => {
          attributes[`${SpanAttributes.LLM_PROMPTS}.${i + j}.role`] =
            content.role ?? "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.${i + j}.content`] =
            this._formatPartsData(content.parts);
        });
      }
    } catch (e) {
      this._diag.debug(e);
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
          result: result as
            | vertexAI.StreamGenerateContentResult
            | vertexAI.GenerateContentResult,
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
    result:
      | vertexAI.StreamGenerateContentResult
      | vertexAI.GenerateContentResult;
  }) {
    try {
      const streamResponse = await result.response;

      if (streamResponse.usageMetadata?.totalTokenCount !== undefined)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          streamResponse.usageMetadata.totalTokenCount,
        );

      if (streamResponse.usageMetadata?.candidatesTokenCount)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          streamResponse.usageMetadata.candidatesTokenCount,
        );

      if (streamResponse.usageMetadata?.promptTokenCount)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          streamResponse.usageMetadata.promptTokenCount,
        );

      if (this._shouldSendPrompts()) {
        streamResponse.candidates?.forEach((candidate, index) => {
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
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _formatPartsData(parts: vertexAI.Part[]): string {
    const result = parts
      .map((part) => {
        if (part.text) return part.text;
        else if (part.fileData)
          return part.fileData.fileUri + "-" + part.fileData.mimeType;
        else if (part.inlineData)
          return part.inlineData.data + "-" + part.inlineData.mimeType;
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
