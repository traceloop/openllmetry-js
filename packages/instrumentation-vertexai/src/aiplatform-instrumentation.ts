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
import { AIPlatformInstrumentationConfig } from "./types";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
} from "@traceloop/ai-semantic-conventions";
import type * as aiplatform from "@google-cloud/aiplatform";
import type { CallOptions, Callback } from "google-gax";
import { version } from "../package.json";

export class AIPlatformInstrumentation extends InstrumentationBase {
  declare protected _config: AIPlatformInstrumentationConfig;

  constructor(config: AIPlatformInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-vertexai", version, config);
  }

  public override setConfig(config: AIPlatformInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    const aiPlatformModule = new InstrumentationNodeModuleDefinition(
      "@google-cloud/aiplatform",
      [">=3.10.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );

    return aiPlatformModule;
  }

  public manuallyInstrument(module: typeof aiplatform) {
    this._diag.debug(`Manually instrumenting @google-cloud/aiplatform`);

    this._wrap(
      module.PredictionServiceClient.prototype,
      "predict",
      this.wrapperMethod(),
    );
  }

  private wrap(module: typeof aiplatform, moduleVersion?: string) {
    this._diag.debug(`Patching @google-cloud/aiplatform@${moduleVersion}`);

    this._wrap(
      module.PredictionServiceClient.prototype,
      "predict",
      this.wrapperMethod(),
    );

    return module;
  }

  private unwrap(module: typeof aiplatform, moduleVersion?: string): void {
    this._diag.debug(`Unpatching @google-cloud/aiplatform@${moduleVersion}`);

    this._unwrap(module.PredictionServiceClient.prototype, "predict");
  }

  private wrapperMethod() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
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
          (e) => {
            if (e) {
              plugin._diag.error(
                "Error in VertexAIPlatform instrumentation",
                e,
              );
            }
          },
        );

        const wrappedPromise = plugin._wrapPromise(span, execPromise);

        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private _startSpan({
    params,
  }: {
    params:
      | aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest
      | undefined;
  }): Span {
    const attributes: Attributes = {
      [SpanAttributes.LLM_SYSTEM]: "VertexAI",
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
    };

    try {
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
            attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE] =
              params?.parameters.structValue?.fields?.temperature.numberValue;
          }
          if (params?.parameters.structValue?.fields?.topP.numberValue) {
            attributes[SpanAttributes.LLM_REQUEST_TOP_P] =
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
              params.instances[0].structValue.fields?.messages.listValue?.values?.[0].structValue?.fields?.content.stringValue;
          }
        }
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
      .then((result) => {
        return new Promise<T>((resolve) => {
          this._endSpan({
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

  private _endSpan({
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
    try {
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
                result[0].metadata?.structValue?.fields?.tokenMetadata
                  .structValue?.fields?.outputTokenCount.structValue?.fields
                  ?.totalTokens.numberValue,
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
              !!prediction.structValue?.fields?.candidates.listValue
                ?.values?.[0]?.structValue?.fields?.content.stringValue
            ) {
              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.role`,
                "assistant",
              );

              span.setAttribute(
                `${SpanAttributes.LLM_COMPLETIONS}.${index}.content`,
                prediction.structValue?.fields?.candidates.listValue
                  ?.values?.[0]?.structValue?.fields?.content.stringValue,
              );
            }
          });
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
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
