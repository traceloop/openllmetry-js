/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/**
 * Chat responses report token usage in more than one place depending on the
 * API version that produced them, so they are read in order of accuracy:
 *
 * 1. `meta.tokens` - actual token counts on current responses.
 * 2. a top-level `token_count` object - present on older responses only. It is
 *    not part of `NonStreamedChatResponse`, but the SDK passes unrecognized
 *    keys through, so it is still readable at runtime.
 * 3. `meta.billedUnits` - billed rather than actual tokens, used as a last
 *    resort (this is the field `generate` spans already fall back to).
 */
export const extractChatTokenUsage = (result: unknown): TokenUsage => {
  if (typeof result !== "object" || result === null) {
    return {};
  }

  const usage: TokenUsage = {};
  const meta =
    "meta" in result && typeof result.meta === "object" && result.meta !== null
      ? (result.meta as Record<string, unknown>)
      : undefined;

  const readCounts = (source: unknown) => {
    if (typeof source !== "object" || source === null) {
      return;
    }
    const counts = source as Record<string, unknown>;
    usage.promptTokens ??= asNumber(counts.inputTokens);
    usage.completionTokens ??= asNumber(counts.outputTokens);
  };

  readCounts(meta?.tokens);

  if ("token_count" in result) {
    const legacy = result.token_count;
    if (typeof legacy === "object" && legacy !== null) {
      const counts = legacy as Record<string, unknown>;
      usage.promptTokens ??= asNumber(counts.prompt_tokens);
      usage.completionTokens ??= asNumber(counts.response_tokens);
      usage.totalTokens ??= asNumber(counts.total_tokens);
    }
  }

  readCounts(meta?.billedUnits);

  if (
    usage.totalTokens === undefined &&
    usage.promptTokens !== undefined &&
    usage.completionTokens !== undefined
  ) {
    usage.totalTokens = usage.promptTokens + usage.completionTokens;
  }

  return usage;
};
