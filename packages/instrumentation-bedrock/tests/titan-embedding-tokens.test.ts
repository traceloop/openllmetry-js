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
import { BedrockInstrumentation } from "../src/instrumentation";
import { BedrockVendor } from "../src/types";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";

// Titan embedding responses carry inputTextTokenCount but no output-token
// field (there is no generated text). total_tokens must not be computed as
// `input + undefined`, which evaluates to NaN and ends up serialized as the
// string "NaN" on the exported span.
// https://github.com/traceloop/openllmetry-js/issues/1031

describe("Bedrock Titan embedding token accounting", () => {
  const instrumentation = new BedrockInstrumentation();

  const setResponseAttrs = (response: Record<string, unknown>, isStream = false) =>
    (instrumentation as any)._setResponseAttributes(
      BedrockVendor.AMAZON,
      response,
      isStream,
    );

  it("emits numeric total_tokens for embedding responses (no output tokens)", () => {
    const attrs = setResponseAttrs({
      embedding: [0.1, 0.2, 0.3],
      inputTextTokenCount: 117,
    });
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 117);
    assert.strictEqual(
      attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      117,
      "total_tokens should equal input tokens when there is no output",
    );
    assert.ok(
      !Number.isNaN(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]),
      "total_tokens must never be NaN",
    );
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in attrs,
      false,
      "output_tokens should be omitted when the response has none",
    );
  });

  it("still sums input + output for Titan text responses", () => {
    const attrs = setResponseAttrs({
      inputTextTokenCount: 10,
      results: [
        { tokenCount: 25, outputText: "hello", completionReason: "FINISH" },
      ],
    });
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 25);
    assert.strictEqual(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS], 35);
  });

  it("guards the streaming final-chunk path the same way", () => {
    const attrs = setResponseAttrs({ inputTextTokenCount: 42 }, true);
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 42);
    assert.strictEqual(
      attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      42,
      "streaming total_tokens should not be NaN when output count is absent",
    );
    assert.strictEqual(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in attrs, false);
  });

  it("still sums both counts on the streaming final chunk when present", () => {
    const attrs = setResponseAttrs(
      {
        inputTextTokenCount: 42,
        totalOutputTextTokenCount: 8,
        completionReason: "FINISH",
      },
      true,
    );
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 42);
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 8);
    assert.strictEqual(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS], 50);
  });
});
