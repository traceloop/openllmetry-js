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

import * as assert from "assert";
import { extractChatTokenUsage } from "../src/usage";

describe("Test chat token usage extraction", () => {
  it("should read actual token counts from meta.tokens", () => {
    assert.deepStrictEqual(
      extractChatTokenUsage({
        meta: {
          tokens: { inputTokens: 11, outputTokens: 22 },
          billedUnits: { inputTokens: 5, outputTokens: 6 },
        },
      }),
      { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
    );
  });

  it("should read the legacy top-level token_count when meta.tokens is absent", () => {
    assert.deepStrictEqual(
      extractChatTokenUsage({
        token_count: {
          prompt_tokens: 1376,
          response_tokens: 60,
          total_tokens: 1436,
        },
        meta: { billedUnits: { inputTokens: 23, outputTokens: 60 } },
      }),
      { promptTokens: 1376, completionTokens: 60, totalTokens: 1436 },
    );
  });

  it("should fall back to meta.billedUnits when nothing else is reported", () => {
    assert.deepStrictEqual(
      extractChatTokenUsage({
        meta: { billedUnits: { inputTokens: 23, outputTokens: 60 } },
      }),
      { promptTokens: 23, completionTokens: 60, totalTokens: 83 },
    );
  });

  it("should return nothing when the response carries no usage", () => {
    assert.deepStrictEqual(extractChatTokenUsage({ text: "hello" }), {});
    assert.deepStrictEqual(extractChatTokenUsage(undefined), {});
  });
});
