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

describe("Amazon Titan token counting semantics", () => {
  const instrumentation = new BedrockInstrumentation();

  const setResponseAttrs = (
    response: Record<string, unknown>,
    isStream = false,
  ) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instrumentation as any)._setResponseAttributes(
      BedrockVendor.AMAZON,
      response,
      isStream,
    );

  describe("Non-streaming responses", () => {
    it("safely handles Titan embedding responses without output tokens", () => {
      // Amazon Titan embedding models (e.g. amazon.titan-embed-text-v2:0)
      // return inputTextTokenCount and an embedding array, but no results[0].tokenCount
      const attrs = setResponseAttrs({
        inputTextTokenCount: 15,
        embedding: [0.1, 0.2, 0.3],
      });

      assert.strictEqual(
        attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
        15,
        "input_tokens should equal inputTextTokenCount",
      );
      assert.strictEqual(
        attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
        undefined,
        "output_tokens should not be present when undefined",
      );
      assert.strictEqual(
        attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
        15,
        "total_tokens should equal inputTextTokenCount (not NaN)",
      );
      assert.ok(
        !Number.isNaN(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]),
        "total_tokens must not be NaN",
      );
    });

    it("correctly computes total tokens when both input and output tokens are present", () => {
      const attrs = setResponseAttrs({
        inputTextTokenCount: 20,
        results: [
          {
            tokenCount: 45,
            outputText: "Hello world",
            completionReason: "FINISH",
          },
        ],
      });

      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 20);
      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 45);
      assert.strictEqual(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS], 65);
    });
  });

  describe("Streaming responses", () => {
    it("safely handles Titan streaming chunks when totalOutputTextTokenCount is absent", () => {
      const attrs = setResponseAttrs(
        {
          inputTextTokenCount: 30,
          completionReason: "FINISH",
        },
        true,
      );

      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 30);
      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], undefined);
      assert.strictEqual(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS], 30);
      assert.ok(
        !Number.isNaN(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]),
        "total_tokens must not be NaN in streaming",
      );
    });

    it("correctly computes total tokens in streaming when both counts are present", () => {
      const attrs = setResponseAttrs(
        {
          inputTextTokenCount: 30,
          totalOutputTextTokenCount: 70,
          completionReason: "FINISH",
        },
        true,
      );

      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 30);
      assert.strictEqual(attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 70);
      assert.strictEqual(attrs[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS], 100);
    });
  });
});
