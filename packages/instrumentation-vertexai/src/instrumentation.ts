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
import * as vertexAI from "@google-cloud/vertexai";
import * as aiplatform from "@google-cloud/aiplatform";
import { CallOptions, Callback } from "google-gax";

export class VertexAIInstrumentation extends InstrumentationBase<any> {
  protected override _config!: VertexAIInstrumentationConfig;

  constructor(config: VertexAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-vertexai", "0.0.17", config);
  }

  public override setConfig(config: VertexAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition<any>[] {
    const vertexAIModule = new InstrumentationNodeModuleDefinition<any>(
      "@google-cloud/vertexai",
      [">=0.2.1"],
      this.vertexai_wrap.bind(this),
      this.vertexai_unwrap.bind(this),
    );

    const aiPlatformModule = new InstrumentationNodeModuleDefinition<any>(
      "@google-cloud/aiplatform",
      [">=3.10.0"],
      this.aiplatform_wrap.bind(this),
      this.aiplatform_unwrap.bind(this),
    );

    return [vertexAIModule, aiPlatformModule];
  }

  private modelConfig: vertexAI.ModelParams = { model: "" };

  private setModal(newValue: vertexAI.ModelParams) {
    this.modelConfig = { ...newValue };
  }

  public manuallyInstrument(
    module1: typeof vertexAI,
    module2: typeof aiplatform,
  ) {
    // For Gemini
    this._wrap(
      module1.VertexAI_Preview.prototype,
      "getGenerativeModel",
      this.wrapperMethodForGemini(),
    );
    // For both stream & non-stream
    // this._wrap(
    //   module1.GenerativeModel.prototype,
    //   "generateContent",
    //   this.wrapperMethodForGemini(),
    // );
    this._wrap(
      module1.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethodForGemini(),
    );

    // For PaLM2
    this._wrap(
      module2.PredictionServiceClient.prototype,
      "predict",
      this.wrapperMethodForPalm2(),
    );
  }

  private vertexai_wrap(moduleExports: typeof vertexAI) {
    this._wrap(
      moduleExports.VertexAI_Preview.prototype,
      "getGenerativeModel",
      this.wrapperMethodForGemini(),
    );
    // For both stream & non-stream
    // this._wrap(
    //   moduleExports.GenerativeModel.prototype,
    //   "generateContent",
    //   this.wrapperMethodForGemini(),
    // );
    this._wrap(
      moduleExports.GenerativeModel.prototype,
      "generateContentStream",
      this.wrapperMethodForGemini(),
    );

    return moduleExports;
  }

  private vertexai_unwrap(moduleExports: typeof vertexAI): void {
    this._unwrap(
      moduleExports.VertexAI_Preview.prototype,
      "getGenerativeModel",
    );
    // this._unwrap(moduleExports.GenerativeModel.prototype, "generateContent");
    this._unwrap(
      moduleExports.GenerativeModel.prototype,
      "generateContentStream",
    );
  }

  private aiplatform_wrap(moduleExports: typeof aiplatform) {
    this._wrap(
      moduleExports.PredictionServiceClient.prototype,
      "predict",
      this.wrapperMethodForPalm2(),
    );

    return moduleExports;
  }

  private aiplatform_unwrap(moduleExports: typeof aiplatform): void {
    this._unwrap(moduleExports.PredictionServiceClient.prototype, "predict");
  }

  private wrapperMethodForGemini() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(
        this: any,
        ...args: (vertexAI.GenerateContentRequest & vertexAI.ModelParams)[]
      ) {
        // To set the model name only
        if (args[0].model) {
          plugin.setModal(args[0]);
          return context.bind(
            context.active(),
            safeExecuteInTheMiddle(
              () => {
                return context.with(context.active(), () => {
                  return original.apply(this, args);
                });
              },
              () => {},
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
          () => {},
        );

        // Its to get the model name
        // if (args[0].model) {
        //   this.model = args[0].model;
        //   return context.bind(execContext, execPromise);
        // }

        const wrappedPromise = plugin._wrapPromise(span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private wrapperMethodForPalm2() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line @typescript-eslint/ban-types
    return (original: Function) => {
      return function method(
        this: any,
        ...args:
          | [
              request?: aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest,
              options?: CallOptions,
            ]
          | [
              request: aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest,
              options: CallOptions,
              callback: Callback<
                aiplatform.protos.google.cloud.aiplatform.v1.IPredictResponse,
                | aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest
                | null
                | undefined,
                object | null | undefined
              >,
            ]
          | [
              request: aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest,
              callback: Callback<
                aiplatform.protos.google.cloud.aiplatform.v1.IPredictResponse,
                | aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest
                | null
                | undefined,
                object | null | undefined
              >,
            ]
      ) {
        const span = plugin._startSpan2({
          params: args[0],
        });

        const execContext = trace.setSpan(context.active(), span);

        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          () => {},
        );

        const wrappedPromise = plugin._wrapPromise2(span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _startSpan2({
    params,
  }: {
    params:
      | aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest
      | undefined;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_VENDOR]: "VertexAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
    };

    if (params !== undefined) {
      if (params.endpoint) {
        const model = params.endpoint.split("/").pop();
        attributes[SpanAttributes.LLM_REQUEST_MODEL] = model;
        attributes[SpanAttributes.LLM_RESPONSE_MODEL] = model;
      }
      if (params?.parameters) {
        if (
          params?.parameters.structValue?.fields?.maxOutputTokens.numberValue
        ) {
          attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS] =
            params?.parameters.structValue?.fields?.maxOutputTokens.numberValue;
        }
        if (params?.parameters.structValue?.fields?.temperature.numberValue) {
          attributes[SpanAttributes.LLM_TEMPERATURE] =
            params?.parameters.structValue?.fields?.temperature.numberValue;
        }
        if (params?.parameters.structValue?.fields?.topP.numberValue) {
          attributes[SpanAttributes.LLM_TOP_P] =
            params?.parameters.structValue?.fields?.topP.numberValue;
        }
        if (params?.parameters.structValue?.fields?.topK.numberValue) {
          attributes[SpanAttributes.LLM_TOP_K] =
            params?.parameters.structValue?.fields?.topK.numberValue;
        }
      }

      if (
        this._shouldSendPrompts() &&
        params.instances &&
        params.instances?.length !== 0
      ) {
        if (
          params.instances[0].structValue?.fields &&
          "prompt" in params.instances[0].structValue.fields &&
          params.instances[0].structValue?.fields?.prompt.stringValue
        ) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
            params.instances[0].structValue?.fields?.prompt.stringValue;
        } else if (
          params.instances[0].structValue &&
          params.instances[0].structValue.fields?.messages.listValue
            ?.values?.[0].structValue?.fields?.content.stringValue
        ) {
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] =
            params.instances[0].structValue.fields?.messages.listValue
              ?.values?.[0].structValue?.fields?.author.stringValue ?? "user";
          attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
            params.instances[0].structValue.fields?.messages.listValue
              ?.values?.[0].structValue?.fields?.content.stringValue;
        }
      }
    }

    return this.tracer.startSpan(`vertexai.completion`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
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

    console.log(">>> attributes", attributes);

    return this.tracer.startSpan(`vertexai.completion`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then((result) => {
        return new Promise<T>((resolve) => {
          this._endSpan({
            span,
            result: result as
              | vertexAI.GenerateContentResult
              | vertexAI.StreamGenerateContentResult,
          });
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

  private _wrapPromise2<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then((result) => {
        return new Promise<T>((resolve) => {
          this._endSpan2({
            span,
            result: result as [
              aiplatform.protos.google.cloud.aiplatform.v1.IPredictResponse,
              (
                | aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest
                | undefined
              ),
              object | undefined,
            ],
          });
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

  private _endSpan2({
    span,
    result,
  }: {
    span: Span;
    result: [
      aiplatform.protos.google.cloud.aiplatform.v1.IPredictResponse,
      aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest | undefined,
      object | undefined,
    ];
  }) {
    if (result[0].model)
      span.setAttribute(SpanAttributes.LLM_RESPONSE_MODEL, result[0].model);

    if (result) {
      if (result[0].metadata) {
        if (
          typeof result[0].metadata?.structValue?.fields?.tokenMetadata
            .structValue?.fields?.outputTokenCount.structValue?.fields
            ?.totalTokens.numberValue === "number"
        )
          span.setAttribute(
            SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
            result[0].metadata?.structValue?.fields?.tokenMetadata.structValue
              ?.fields?.outputTokenCount.structValue?.fields?.totalTokens
              .numberValue,
          );

        if (
          typeof result[0].metadata?.structValue?.fields?.tokenMetadata
            .structValue?.fields?.inputTokenCount.structValue?.fields
            ?.totalTokens.numberValue === "number"
        )
          span.setAttribute(
            SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
            result[0].metadata?.structValue?.fields?.tokenMetadata.structValue
              ?.fields?.inputTokenCount.structValue?.fields?.totalTokens
              .numberValue,
          );

        if (
          typeof result[0].metadata?.structValue?.fields?.tokenMetadata
            .structValue?.fields?.inputTokenCount.structValue?.fields
            ?.totalTokens.numberValue === "number" &&
          typeof result[0].metadata?.structValue?.fields?.tokenMetadata
            .structValue?.fields?.outputTokenCount.structValue?.fields
            ?.totalTokens.numberValue === "number"
        )
          span.setAttribute(
            SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
            result[0].metadata?.structValue?.fields?.tokenMetadata.structValue
              ?.fields?.inputTokenCount.structValue?.fields?.totalTokens
              .numberValue +
              result[0].metadata?.structValue?.fields?.tokenMetadata.structValue
                ?.fields?.outputTokenCount.structValue?.fields?.totalTokens
                .numberValue,
          );
      }

      if (this._shouldSendPrompts()) {
        result[0].predictions?.forEach((prediction, index) => {
          if (
            prediction.structValue?.fields &&
            "content" in prediction.structValue.fields &&
            !!prediction.structValue?.fields?.content.stringValue
          ) {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              "assistant",
            );

            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              prediction.structValue?.fields?.content.stringValue,
            );
          } else if (
            prediction.structValue?.fields &&
            "candidates" in prediction.structValue.fields &&
            !!prediction.structValue?.fields?.candidates.listValue?.values?.[0]
              ?.structValue?.fields?.content.stringValue
          ) {
            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
              "assistant",
            );

            span.setAttribute(
              `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
              prediction.structValue?.fields?.candidates.listValue?.values?.[0]
                ?.structValue?.fields?.content.stringValue,
            );
          }
        });
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  private _endSpan({
    span,
    result,
  }: {
    span: Span;
    result:
      | vertexAI.GenerateContentResult
      | vertexAI.StreamGenerateContentResult;
  }) {
    span.setAttribute(
      SpanAttributes.LLM_RESPONSE_MODEL,
      this.modelConfig.model,
    );

    if ("then" in result.response && "stream" in result) {
      result.response.then((response) => {
        if (response.usageMetadata?.totalTokenCount !== undefined)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
            response.usageMetadata.totalTokenCount,
          );

        if (response.usageMetadata?.candidates_token_count)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
            response.usageMetadata.candidates_token_count,
          );

        if (response.usageMetadata?.prompt_token_count)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
            response.usageMetadata.prompt_token_count,
          );
      });

      if (this._shouldSendPrompts()) {
        (async () => {
          let index = 0;
          for await (const item of result.stream) {
            const candidate = item.candidates[0];
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

            index += 1;
          }
        })();
        // for (const [index, item] of [...[result.stream]].entries()) {
        //   item.next().then((data) => {

        //   });
        // }
      }
    } else if (!("then" in result.response)) {
      if (result.response.usageMetadata) {
        if (result.response.usageMetadata.totalTokenCount !== undefined)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_TOTAL_TOKENS,
            result.response.usageMetadata.totalTokenCount,
          );

        if (result.response.usageMetadata.candidates_token_count)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_COMPLETION_TOKENS,
            result.response.usageMetadata.candidates_token_count,
          );

        if (result.response.usageMetadata.prompt_token_count)
          span.setAttribute(
            SpanAttributes.LLM_USAGE_PROMPT_TOKENS,
            result.response.usageMetadata?.prompt_token_count,
          );
      }
      if (this._shouldSendPrompts()) {
        result.response.candidates.forEach((candidate, index) => {
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
    }

    console.log(">>> span", span);

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
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
