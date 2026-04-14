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
  FinishReasons,
} from "@traceloop/ai-semantic-conventions";
import {
  formatSystemInstructions,
  formatInputMessages,
  formatOutputMessage,
  mapGoogleGenAIContentBlock,
} from "@traceloop/instrumentation-utils";
import {
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_PROVIDER_NAME,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from "@opentelemetry/semantic-conventions/incubating";
import { GoogleGenAIInstrumentationConfig } from "./types";
import { version } from "../package.json";
import type * as genaiModule from "@google/genai";

// Mapping of Google GenAI finish reasons to standardized OTel finish reasons
export const googleGenAIFinishReasonMap: Record<string, string> = {
  STOP: FinishReasons.STOP,
  MAX_TOKENS: FinishReasons.LENGTH,
  SAFETY: FinishReasons.CONTENT_FILTER,
  RECITATION: FinishReasons.CONTENT_FILTER,
  OTHER: "other",
  FINISH_REASON_UNSPECIFIED: "",
};

// The @google/genai SDK defines generateContent and generateContentStream as
// arrow functions (instance properties bound in the constructor). Prototype
// patching cannot intercept these directly. Instead, we patch the underlying
// prototype methods they delegate to: generateContentInternal and
// generateContentStreamInternal. These are not part of the public API surface
// and use `as any` casts — if a future SDK version renames or removes them,
// the instrumentation will silently stop producing spans rather than crash.
export class GoogleGenAIInstrumentation extends InstrumentationBase {
  declare protected _config: GoogleGenAIInstrumentationConfig;

  constructor(config: GoogleGenAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-google-genai", version, config);
  }

  public override setConfig(config: GoogleGenAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  public manuallyInstrument(module: typeof genaiModule) {
    this._diag.debug(`Patching @google/genai manually`);

    this._wrap(
      module.Models.prototype,
      "generateContentInternal" as any,
      this.patchGenerateContent(),
    );
    this._wrap(
      module.Models.prototype,
      "generateContentStreamInternal" as any,
      this.patchGenerateContentStream(),
    );
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      "@google/genai",
      [">=1.0.0"],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(moduleExports: typeof genaiModule, moduleVersion?: string) {
    this._diag.debug(`Patching @google/genai@${moduleVersion}`);

    this._wrap(
      moduleExports.Models.prototype,
      "generateContentInternal" as any,
      this.patchGenerateContent(),
    );
    this._wrap(
      moduleExports.Models.prototype,
      "generateContentStreamInternal" as any,
      this.patchGenerateContentStream(),
    );
    return moduleExports;
  }

  private unpatch(
    moduleExports: typeof genaiModule,
    moduleVersion?: string,
  ): void {
    this._diag.debug(`Unpatching @google/genai@${moduleVersion}`);

    this._unwrap(
      moduleExports.Models.prototype,
      "generateContentInternal" as any,
    );
    this._unwrap(
      moduleExports.Models.prototype,
      "generateContentStreamInternal" as any,
    );
  }

  private patchGenerateContent() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const params = args[0] as any;
        const span = plugin.startSpan(params);

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error("Error in Google GenAI instrumentation", e);
            }
          },
        );

        const wrappedPromise = plugin._wrapPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise as any);
      };
    };
  }

  private patchGenerateContentStream() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    // eslint-disable-next-line
    return (original: Function) => {
      return function method(this: any, ...args: unknown[]) {
        const params = args[0] as any;
        const span = plugin.startSpan(params);

        const execContext = trace.setSpan(context.active(), span);
        const execPromise = safeExecuteInTheMiddle(
          () => {
            return context.with(execContext, () => {
              return original.apply(this, args);
            });
          },
          (e) => {
            if (e) {
              plugin._diag.error("Error in Google GenAI instrumentation", e);
            }
          },
        );

        const wrappedPromise = plugin._wrapStreamPromise(span, execPromise);
        return context.bind(execContext, wrappedPromise);
      };
    };
  }

  private startSpan(params: any): Span {
    const attributes: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
    };

    try {
      const model = params?.model;
      attributes[ATTR_GEN_AI_REQUEST_MODEL] = model;

      const config = params?.config;
      if (config) {
        if (config.temperature !== undefined) {
          attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = config.temperature;
        }
        if (config.topP !== undefined) {
          attributes[ATTR_GEN_AI_REQUEST_TOP_P] = config.topP;
        }
        if (config.topK !== undefined) {
          attributes[ATTR_GEN_AI_REQUEST_TOP_K] = config.topK;
        }
        if (config.maxOutputTokens !== undefined) {
          attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = config.maxOutputTokens;
        }

        if (config.thinkingConfig) {
          if (config.thinkingConfig.thinkingBudget !== undefined) {
            attributes[SpanAttributes.GEN_AI_REQUEST_THINKING_BUDGET_TOKENS] =
              config.thinkingConfig.thinkingBudget;
          }
        }
      }

      if (this._shouldSendPrompts()) {
        // System instructions
        if (config?.systemInstruction !== undefined) {
          attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] =
            formatGoogleGenAISystemInstruction(config.systemInstruction);
        }

        // Input messages
        const contents = params?.contents;
        if (contents !== undefined) {
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            formatGoogleGenAIContents(contents);
        }
      }
    } catch (e) {
      this._diag.debug(e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_CHAT} ${params?.model ?? "unknown"}`,
      {
        kind: SpanKind.CLIENT,
        attributes,
      },
    );
  }

  private _wrapPromise<T>(span: Span, promise: Promise<T>): Promise<T> {
    return promise
      .then((result) => {
        this._endSpan(span, result as any);
        return result;
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message,
        });
        span.recordException(
          error instanceof Error ? error : new Error(message),
        );
        span.end();
        throw error;
      });
  }

  // generateContentStreamInternal is an async generator — it returns an
  // AsyncGenerator synchronously, not a Promise. safeExecuteInTheMiddle
  // passes this through as-is. `await` on a non-thenable is a no-op, so
  // the typed parameter works for both cases.
  private async _wrapStreamPromise(
    span: Span,
    streamOrPromise: AsyncIterable<any> | Promise<AsyncIterable<any>>,
  ): Promise<AsyncGenerator<any>> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;

    try {
      const stream = await streamOrPromise;

      async function* instrumentedStream() {
        // The last streamed chunk contains the final usageMetadata and
        // finishReason, which we extract when ending the span.
        let lastChunk: any = null;
        try {
          for await (const chunk of stream) {
            lastChunk = chunk;
            yield chunk;
          }

          if (lastChunk) {
            plugin._endSpan(span, lastChunk);
          } else {
            span.end();
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message,
          });
          span.recordException(
            error instanceof Error ? error : new Error(message),
          );
          span.end();
          throw error;
        }
      }

      return instrumentedStream();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message,
      });
      span.recordException(
        error instanceof Error ? error : new Error(message),
      );
      span.end();
      throw error;
    }
  }

  private _endSpan(span: Span, result: any) {
    try {
      // Response model
      if (result.modelVersion) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, result.modelVersion);
      }

      // Finish reason from first candidate
      const candidates = result.candidates;
      if (candidates && candidates.length > 0 && candidates[0].finishReason) {
        const reason = candidates[0].finishReason;
        const mappedReason =
          googleGenAIFinishReasonMap[reason] ?? reason.toLowerCase();
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [mappedReason]);
      }

      // Token usage
      const usage = result.usageMetadata;
      if (usage) {
        if (usage.promptTokenCount !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_INPUT_TOKENS,
            usage.promptTokenCount,
          );
        }
        if (usage.candidatesTokenCount !== undefined) {
          span.setAttribute(
            ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
            usage.candidatesTokenCount,
          );
        }
        if (usage.totalTokenCount !== undefined) {
          span.setAttribute(
            SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
            usage.totalTokenCount,
          );
        }
      }

      // Output messages
      if (this._shouldSendPrompts() && candidates && candidates.length > 0) {
        const candidate = candidates[0];
        const content = candidate.content?.parts;
        const finishReason = candidate.finishReason ?? null;

        if (content) {
          const outputMessages = formatOutputMessage(
            content,
            finishReason,
            googleGenAIFinishReasonMap,
            GEN_AI_OPERATION_NAME_VALUE_CHAT,
            mapGoogleGenAIContentBlock,
          );
          span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
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

/**
 * Normalizes Google GenAI system instructions to the OTel format.
 * The systemInstruction can be a string, a Content object, or a Part[].
 */
function formatGoogleGenAISystemInstruction(systemInstruction: any): string {
  if (typeof systemInstruction === "string") {
    return formatSystemInstructions(systemInstruction);
  }

  // Content object with parts
  if (systemInstruction.parts) {
    return JSON.stringify(
      systemInstruction.parts.map(mapGoogleGenAIContentBlock),
    );
  }

  // Array of parts
  if (Array.isArray(systemInstruction)) {
    return JSON.stringify(systemInstruction.map(mapGoogleGenAIContentBlock));
  }

  return formatSystemInstructions(String(systemInstruction));
}

/**
 * Normalizes Google GenAI contents parameter to the OTel input messages format.
 * Contents can be a string, a Content object, a Part[], or a Content[].
 */
function formatGoogleGenAIContents(contents: any): string {
  // String prompt
  if (typeof contents === "string") {
    return JSON.stringify([
      {
        role: "user",
        parts: [{ type: "text", content: contents }],
      },
    ]);
  }

  // Single Content object
  if (!Array.isArray(contents) && contents.parts) {
    const role =
      contents.role === "model" ? "assistant" : contents.role || "user";
    return formatInputMessages(
      [{ role, content: contents.parts }],
      mapGoogleGenAIContentBlock,
    );
  }

  // Array — determine if it's Content[] or Part[]
  if (Array.isArray(contents) && contents.length > 0) {
    // If items have a 'role' property, treat as Content[]
    if (contents[0].role !== undefined || contents[0].parts !== undefined) {
      const messages = contents.map((c: any) => ({
        role: c.role === "model" ? "assistant" : c.role || "user",
        content: c.parts || [],
      }));
      return formatInputMessages(messages, mapGoogleGenAIContentBlock);
    }

    // Otherwise treat as Part[] (single user message)
    return formatInputMessages(
      [{ role: "user", content: contents }],
      mapGoogleGenAIContentBlock,
    );
  }

  return JSON.stringify([]);
}
