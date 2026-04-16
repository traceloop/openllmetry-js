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
  Attributes,
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  Span,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  formatInputMessages,
  formatOutputMessage,
} from "@traceloop/instrumentation-utils";
import { mapGenAIContentBlock } from "./content-block-mapper";
import {
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
  SpanAttributes,
  FinishReasons,
} from "@traceloop/ai-semantic-conventions";
import type * as genai from "@google/genai";
import { GenAIInstrumentationConfig } from "./types";
import { version } from "../package.json";

export const genaiFinishReasonMap: Record<string, string> = {
  STOP: FinishReasons.STOP,
  MAX_TOKENS: FinishReasons.LENGTH,
  SAFETY: FinishReasons.CONTENT_FILTER,
  RECITATION: FinishReasons.CONTENT_FILTER,
  LANGUAGE: FinishReasons.CONTENT_FILTER,
  OTHER: FinishReasons.ERROR,
  BLOCKLIST: FinishReasons.CONTENT_FILTER,
  PROHIBITED_CONTENT: FinishReasons.CONTENT_FILTER,
  SPII: FinishReasons.CONTENT_FILTER,
  MALFORMED_FUNCTION_CALL: FinishReasons.ERROR,
  IMAGE_SAFETY: FinishReasons.CONTENT_FILTER,
  FINISH_REASON_UNSPECIFIED: FinishReasons.FINISH_REASON_UNSPECIFIED,
  UNEXPECTED_TOOL_CALL: FinishReasons.ERROR,
  IMAGE_PROHIBITED_CONTENT: FinishReasons.CONTENT_FILTER,
  NO_IMAGE: FinishReasons.ERROR,
  IMAGE_RECITATION: FinishReasons.CONTENT_FILTER,
  IMAGE_OTHER: FinishReasons.ERROR,
};

export class GenAIInstrumentation extends InstrumentationBase {
  declare protected _config: GenAIInstrumentationConfig;
  /** Tracks already-patched modules to prevent double-patching on repeated calls. */
  private readonly _instrumentedModules = new WeakSet<object>();

  constructor(config: GenAIInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-google-generativeai", version, config);
  }

  public override setConfig(config: GenAIInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init(): InstrumentationModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      "@google/genai",
      [">=1.0.0 <2.0.0"],
      this.wrap.bind(this),
      this.unwrap.bind(this),
    );
  }

  private wrap(module: typeof genai, moduleVersion?: string) {
    this._diag.debug(`Patching @google/genai@${moduleVersion}`);
    if (this._instrumentedModules.has(module)) return module;
    this._instrumentedModules.add(module);
    this._wrap(module, "GoogleGenAI", this.wrapGoogleGenAI());
    return module;
  }

  private unwrap(module: typeof genai) {
    this._instrumentedModules.delete(module);
    this._unwrap(module, "GoogleGenAI");
  }

  public manuallyInstrument(module: typeof genai) {
    if (this._instrumentedModules.has(module)) return;
    this._instrumentedModules.add(module);
    this._diag.debug("Manually instrumenting @google/genai");
    this._wrap(module, "GoogleGenAI", this.wrapGoogleGenAI());
  }

  private _shouldSendPrompts(): boolean {
    const ctxValue = context.active().getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);
    if (ctxValue !== undefined) return ctxValue as boolean;
    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }

  private wrapGoogleGenAI() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return (OriginalGoogleGenAI: typeof genai.GoogleGenAI) => {
      return function PatchedGoogleGenAI(
        this: unknown,
        options: ConstructorParameters<typeof genai.GoogleGenAI>[0],
      ) {
        const instance = new OriginalGoogleGenAI(options);

        const origGenerate = instance.models.generateContent.bind(
          instance.models,
        );
        instance.models.generateContent = plugin.wrapGenerateContent()(
          origGenerate,
        ) as typeof instance.models.generateContent;

        const origStream = instance.models.generateContentStream.bind(
          instance.models,
        );
        instance.models.generateContentStream =
          plugin.wrapGenerateContentStream()(
            origStream,
          ) as typeof instance.models.generateContentStream;

        return instance;
      } as unknown as typeof genai.GoogleGenAI;
    };
  }

  private wrapGenerateContent() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return (
      original: (
        params: genai.GenerateContentParameters,
      ) => Promise<genai.GenerateContentResponse>,
    ) => {
      return function method(
        this: unknown,
        params: genai.GenerateContentParameters,
      ) {
        const span = plugin._startSpan(params);
        // Capture traceContent decision at span-start time so _endSpan uses the
        // same value even if the active context changes by the time the promise resolves.
        const shouldSendPrompts = plugin._shouldSendPrompts();
        const execContext = trace.setSpan(context.active(), span);

        let execPromise: Promise<genai.GenerateContentResponse>;
        try {
          execPromise = safeExecuteInTheMiddle(
            () =>
              context.with(execContext, () => original.apply(this, [params])),
            (e) => {
              if (e) plugin._diag.error("Error calling generateContent", e);
            },
          );
        } catch (e: unknown) {
          // safeExecuteInTheMiddle re-throws synchronous errors — end the span here
          // so it is not leaked when the original function throws synchronously.
          // e is always truthy here (safeExecuteInTheMiddle only re-throws truthy errors).
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (e as Error).message,
          });
          span.recordException(e as Error);
          span.end();
          throw e;
        }

        return execPromise
          .then((result: genai.GenerateContentResponse) => {
            plugin._endSpan(span, result, shouldSendPrompts);
            return result;
          })
          .catch((error: Error) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.recordException(error);
            span.end();
            throw error;
          });
      };
    };
  }

  private wrapGenerateContentStream() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;
    return (
      original: (
        params: genai.GenerateContentParameters,
      ) => Promise<AsyncGenerator<genai.GenerateContentResponse>>,
    ) => {
      return function method(
        this: unknown,
        params: genai.GenerateContentParameters,
      ) {
        const span = plugin._startSpan(params);
        // Capture traceContent decision at span-start time so _endSpan uses the
        // same value regardless of the async context during generator iteration.
        const shouldSendPrompts = plugin._shouldSendPrompts();
        const execContext = trace.setSpan(context.active(), span);

        let originalPromise: Promise<
          AsyncGenerator<genai.GenerateContentResponse>
        >;
        try {
          originalPromise = safeExecuteInTheMiddle(
            () =>
              context.with(execContext, () => original.apply(this, [params])),
            (e) => {
              if (e)
                plugin._diag.error("Error calling generateContentStream", e);
            },
          );
        } catch (e: unknown) {
          // safeExecuteInTheMiddle re-throws synchronous errors — end the span here.
          // e is always truthy here (safeExecuteInTheMiddle only re-throws truthy errors).
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (e as Error).message,
          });
          span.recordException(e as Error);
          span.end();
          throw e;
        }

        return originalPromise
          .then((originalGenerator) => {
            async function* wrappedGenerator() {
              let lastChunk: genai.GenerateContentResponse | undefined;
              // Track accumulated parts per candidate index for multi-candidate streaming.
              const accumulatedPartsByCandidate: genai.Part[][] = [];
              let spanEnded = false;
              try {
                for await (const chunk of originalGenerator) {
                  lastChunk = chunk;
                  // Accumulate content parts across chunks for every candidate.
                  const chunkCandidates = chunk.candidates ?? [];
                  for (let ci = 0; ci < chunkCandidates.length; ci++) {
                    const cParts = chunkCandidates[ci]?.content?.parts;
                    if (cParts) {
                      if (!accumulatedPartsByCandidate[ci]) {
                        accumulatedPartsByCandidate[ci] = [];
                      }
                      const acc = accumulatedPartsByCandidate[ci];
                      for (const part of cParts) {
                        if (part.text !== undefined) {
                          const prev = acc[acc.length - 1];
                          if (
                            prev?.text !== undefined &&
                            !!prev.thought === !!part.thought
                          ) {
                            prev.text += part.text; // concatenate consecutive same-type text parts
                          } else {
                            acc.push({ ...part });
                          }
                        } else {
                          acc.push({ ...part });
                        }
                      }
                    }
                  }
                  yield chunk;
                }
                if (lastChunk) {
                  // Build response with accumulated content for output.messages.
                  const lastCandidates = lastChunk.candidates ?? [];
                  const hasAccumulated = accumulatedPartsByCandidate.some(
                    (parts) => parts.length > 0,
                  );
                  const finalResponse =
                    hasAccumulated && lastCandidates.length > 0
                      ? ({
                          ...lastChunk,
                          candidates: lastCandidates.map((candidate, ci) => {
                            const accumulated = accumulatedPartsByCandidate[ci];
                            if (!accumulated?.length) return candidate;
                            return {
                              ...candidate,
                              content: {
                                ...(candidate.content ?? { role: "model" }),
                                parts: accumulated,
                              },
                            };
                          }),
                        } as genai.GenerateContentResponse)
                      : lastChunk;
                  spanEnded = true;
                  plugin._endSpan(span, finalResponse, shouldSendPrompts);
                } else {
                  spanEnded = true;
                  span.setStatus({ code: SpanStatusCode.OK });
                  span.end();
                }
              } catch (error: unknown) {
                spanEnded = true;
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: (error as Error).message,
                });
                span.recordException(error as Error);
                span.end();
                throw error;
              } finally {
                // Guarantee span is ended if the consumer abandons iteration early
                // (e.g. break/return inside a for-await loop), which skips both the
                // post-loop code and the catch block.
                if (!spanEnded) {
                  span.setStatus({ code: SpanStatusCode.OK });
                  span.end();
                }
              }
            }
            return wrappedGenerator();
          })
          .catch((error: Error) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.recordException(error);
            span.end();
            throw error;
          });
      };
    };
  }

  private _startSpan(params: genai.GenerateContentParameters): Span {
    const rawModel = params.model ?? "";
    const model = rawModel.startsWith("models/")
      ? rawModel.slice("models/".length)
      : rawModel;
    const operationType = GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT;

    const attributes: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
      [ATTR_GEN_AI_OPERATION_NAME]: operationType,
      [ATTR_GEN_AI_REQUEST_MODEL]: model,
    };

    try {
      if (params.config?.temperature != null)
        attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.config.temperature;
      if (params.config?.topP != null)
        attributes[ATTR_GEN_AI_REQUEST_TOP_P] = params.config.topP;
      if (params.config?.maxOutputTokens != null)
        attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
          params.config.maxOutputTokens;
      if (params.config?.topK != null)
        attributes[ATTR_GEN_AI_REQUEST_TOP_K] = params.config.topK;
      if (params.config?.presencePenalty != null)
        attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] =
          params.config.presencePenalty;
      if (params.config?.frequencyPenalty != null)
        attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] =
          params.config.frequencyPenalty;

      if (
        params.config?.stopSequences != null &&
        params.config.stopSequences.length > 0
      )
        attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] =
          params.config.stopSequences;

      if (params.config?.thinkingConfig?.thinkingBudget != null)
        attributes[SpanAttributes.GEN_AI_REQUEST_THINKING_BUDGET_TOKENS] =
          params.config.thinkingConfig.thinkingBudget;

      // Tool definitions, system instructions, and input messages — all gated by
      // traceContent (aligned with Python openllmetry repo).
      if (this._shouldSendPrompts()) {
        if (params.config?.tools) {
          const toolDefs = Array.isArray(params.config.tools)
            ? params.config.tools
            : [params.config.tools];
          if (toolDefs.length > 0) {
            attributes[ATTR_GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(toolDefs);
          }
        }

        if (params.config?.systemInstruction) {
          const siParts = extractSystemInstructionParts(
            params.config.systemInstruction,
          );
          if (siParts.length > 0) {
            attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = JSON.stringify(
              siParts.map(mapGenAIContentBlock),
            );
          }
        }

        if (params.contents) {
          const normalized = normalizeContents(params.contents);
          if (normalized.length > 0) {
            attributes[ATTR_GEN_AI_INPUT_MESSAGES] = formatInputMessages(
              normalized,
              mapGenAIContentBlock,
            );
          }
        }
      }
    } catch (e) {
      this._diag.debug("Error in _startSpan", e);
      this._config.exceptionLogger?.(e);
    }

    return this.tracer.startSpan(`${operationType} ${model}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  private _endSpan(
    span: Span,
    response: genai.GenerateContentResponse,
    shouldSendPrompts: boolean,
  ) {
    try {
      const candidates = response.candidates ?? [];

      // Collect finish reasons per-candidate (no dedup — matches Python behaviour).
      // null/unspecified → ""; set attr only when at least one reason is non-empty.
      const finishReasons = candidates.map((c) => {
        const r = c.finishReason;
        return r != null ? (genaiFinishReasonMap[r] ?? r) : "";
      });
      if (finishReasons.some((r) => r !== "")) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, finishReasons);
      }

      if (response.modelVersion)
        span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, response.modelVersion);

      if (response.responseId)
        span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, response.responseId);

      const inputTokens = response.usageMetadata?.promptTokenCount;
      const outputTokens = response.usageMetadata?.candidatesTokenCount;
      const totalTokens = response.usageMetadata?.totalTokenCount;
      const reasoningTokens = response.usageMetadata?.thoughtsTokenCount;
      const cachedTokens = response.usageMetadata?.cachedContentTokenCount;
      if (inputTokens != null)
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
      if (outputTokens != null)
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
      if (totalTokens != null)
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
          totalTokens,
        );
      if (reasoningTokens != null)
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS,
          reasoningTokens,
        );
      if (cachedTokens != null)
        span.setAttribute(
          ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
          cachedTokens,
        );

      if (shouldSendPrompts) {
        // Build one OutputMessage per candidate using formatOutputMessage,
        // then merge into a single JSON array.
        const outputMessages = candidates
          .filter((c) => c.content?.parts)
          .map(
            (c) =>
              JSON.parse(
                formatOutputMessage(
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  c.content!.parts!,
                  c.finishReason ?? null,
                  genaiFinishReasonMap,
                  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
                  mapGenAIContentBlock,
                ),
              )[0],
          );
        if (outputMessages.length > 0) {
          span.setAttribute(
            ATTR_GEN_AI_OUTPUT_MESSAGES,
            JSON.stringify(outputMessages),
          );
        }
      }
    } catch (e) {
      this._diag.debug("Error in _endSpan", e);
      this._config.exceptionLogger?.(e);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

// ---------------------------------------------------------------------------
// Helpers — normalize @google/genai union types
// ---------------------------------------------------------------------------

function normalizeContents(
  contents: genai.ContentListUnion,
): Array<{ role: string; content: string | genai.Part[] }> {
  // string
  if (typeof contents === "string") {
    return [{ role: "user", content: contents }];
  }

  if (Array.isArray(contents)) {
    // Empty array — no messages to emit
    if (contents.length === 0) return [];
    // Content[] — first item has .parts as an array or null (no Part variant has this field).
    const firstAsContent = contents[0] as genai.Content;
    if (
      firstAsContent.parts !== undefined &&
      (firstAsContent.parts === null || Array.isArray(firstAsContent.parts))
    ) {
      return (contents as genai.Content[]).map((c) => ({
        role: normalizeRole(c.role ?? "user"),
        content: c.parts ?? [],
      }));
    }
    // Part[] — treat as single user message
    return [{ role: "user", content: contents as genai.Part[] }];
  }

  // non-array: Content object (has .parts) or single Part (no .parts)
  if ((contents as genai.Content).parts !== undefined) {
    const c = contents as genai.Content;
    return [{ role: normalizeRole(c.role ?? "user"), content: c.parts ?? [] }];
  }
  // single Part — wrap in an array as a one-part user message
  return [{ role: "user", content: [contents as genai.Part] }];
}

/**
 * Extracts raw genai.Part[] from any ContentUnion variant so they can be
 * passed through mapGenAIContentBlock for full part-type support (text,
 * inlineData, fileData, functionCall, etc.).
 */
function extractSystemInstructionParts(si: genai.ContentUnion): genai.Part[] {
  if (typeof si === "string") {
    return [{ text: si }];
  }

  if (Array.isArray(si)) {
    // Could be Part[] or Content[] — check first element for Content shape.
    if (si.length > 0) {
      const firstAsContent = si[0] as genai.Content;
      if (
        firstAsContent.parts !== undefined &&
        (firstAsContent.parts === null || Array.isArray(firstAsContent.parts))
      ) {
        // Content[] — flatten all parts
        return (si as genai.Content[]).flatMap((c) => c.parts ?? []);
      }
    }
    // Part[]
    return si as genai.Part[];
  }

  // non-array: Content object (has .parts) or single Part (no .parts)
  if ((si as genai.Content).parts !== undefined) {
    return (si as genai.Content).parts ?? [];
  }
  // single Part
  return [si as genai.Part];
}

function normalizeRole(role: string): string {
  return role === "model" ? "assistant" : role;
}
