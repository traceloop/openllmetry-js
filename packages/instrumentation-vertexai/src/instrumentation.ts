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
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  GenerateContentRequest,
  GenerateContentResponse,
  Part,
  VertexAI,
} from "@google-cloud/vertexai";

export class VertexAIInstrumentation extends InstrumentationBase {
  protected override _config!: VertexAIInstrumentationConfig;

  constructor(config: VertexAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-vertexai", "0.0.17", config);
  }

  public override setConfig(config: VertexAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<unknown> {
    const module = new InstrumentationNodeModuleDefinition<unknown>(
      "@google-cloud/vertexai",
      [">=0.2.1"],
    );
    return module;
  }

  public manuallyInstrument(module: typeof VertexAI) {
    this._wrap(
      module.prototype.preview.getGenerativeModel.prototype,
      "generateContent",
      this.patchVertexAI(),
    );
  }

  private patchVertexAI() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(this: any, ...args: GenerateContentRequest[]) {
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

  private _startSpan({ params }: { params: GenerateContentRequest }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_VENDOR]: "VertexAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
    };

    attributes[SpanAttributes.LLM_REQUEST_MODEL] = "Test Model";

    if (
      params.generation_config !== undefined &&
      typeof params.generation_config === "object"
    ) {
      if (params.generation_config.max_output_tokens) {
        attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
          params.generation_config.max_output_tokens;
      }
      if (params.generation_config.temperature) {
        attributes[SpanAttributes.LLM_TEMPERATURE] =
          params.generation_config.temperature;
      }
      if (params.generation_config.top_p) {
        attributes[SpanAttributes.LLM_TOP_P] = params.generation_config.top_p;
      }
      if (params.generation_config.top_k) {
        attributes[SpanAttributes.LLM_TOP_K] = params.generation_config.top_k;
      }
    }

    if (this._shouldSendPrompts()) {
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] =
        params.contents[0].role ?? "user";
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
        this._formatPartsData(params.contents[0].parts);
    }

    return this.tracer.startSpan(`vertexai.completion`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then((result) => {
        return new Promise<T>((resolve) => {
          this._endSpan({ span, result: result as GenerateContentResponse });
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
    result,
  }: {
    span: Span;
    result: GenerateContentResponse;
  }) {
    span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, "Test Model");
    if (result.usageMetadata) {
      if (result.usageMetadata.totalTokenCount !== undefined)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
          result.usageMetadata.totalTokenCount,
        );

      if (result.usageMetadata.candidates_token_count)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
          result.usageMetadata.candidates_token_count,
        );

      if (result.usageMetadata.prompt_token_count)
        span.setAttribute(
          SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
          result.usageMetadata?.prompt_token_count,
        );
    }

    if (this._shouldSendPrompts()) {
      result.candidates.forEach((candidate, index) => {
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

    span.end();
  }

  private _formatPartsData(parts: Part[]): Array<string> {
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

    return result;
  }

  private _shouldSendPrompts() {
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
