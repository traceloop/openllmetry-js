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
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";

// Per OTel GenAI semconv, cache_read.input_tokens and cache_creation.input_tokens
// SHOULD be included in gen_ai.usage.input_tokens (subset semantics).
// These tests exercise the Anthropic-on-Bedrock response handler directly.

describe("Bedrock Anthropic cache token fold-in semantics", () => {
  const instrumentation = new BedrockInstrumentation();

  const setResponseAttrs = (usage: Record<string, unknown>) =>
    (instrumentation as any)._setResponseAttributes(
      BedrockVendor.ANTHROPIC,
      {
        stop_reason: "end_turn",
        usage,
        content: [],
      },
      false,
    );

  it("folds cache_read + cache_creation into input_tokens and total_tokens", () => {
    const attrs = setResponseAttrs({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 200,
    });
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
      1200,
      "input_tokens should equal 100 + 900 + 200",
    );
    assert.strictEqual(
      attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      1250,
      "total_tokens should equal summed input (1200) + output (50)",
    );
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      900,
    );
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      200,
    );
  });

  it("folds only cache_read when cache_creation is absent", () => {
    const attrs = setResponseAttrs({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 900,
    });
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 1000);
    assert.strictEqual(
      attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      1050,
    );
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      900,
    );
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      undefined,
    );
  });

  it("leaves input_tokens unchanged when no cache fields present", () => {
    const attrs = setResponseAttrs({
      input_tokens: 100,
      output_tokens: 50,
    });
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
    assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 50);
    assert.strictEqual(
      attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      150,
    );
    assert.strictEqual(
      attrs[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      undefined,
    );
  });
});
