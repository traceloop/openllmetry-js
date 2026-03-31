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

/**
 * Unit tests for mapBedrockContentBlock.
 *
 * TDD — these tests define the contract for the function before it exists.
 * They will FAIL until mapBedrockContentBlock is added to
 * packages/instrumentation-utils/src/content-block-mappers.ts
 * and exported from packages/instrumentation-utils/src/index.ts.
 */

import * as assert from "assert";
import { mapBedrockContentBlock } from "@traceloop/instrumentation-utils";

describe("mapBedrockContentBlock", () => {
  // -------------------------------------------------------------------------
  // Plain string input
  // -------------------------------------------------------------------------
  describe("plain string input", () => {
    it("maps a plain string to TextPart", () => {
      assert.deepStrictEqual(mapBedrockContentBlock("hello world"), {
        type: "text",
        content: "hello world",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Text blocks
  // -------------------------------------------------------------------------
  describe("text block", () => {
    it("maps { type: 'text', text } to TextPart", () => {
      assert.deepStrictEqual(
        mapBedrockContentBlock({ type: "text", text: "What is 2+2?" }),
        { type: "text", content: "What is 2+2?" },
      );
    });

    it("maps empty text string", () => {
      assert.deepStrictEqual(
        mapBedrockContentBlock({ type: "text", text: "" }),
        {
          type: "text",
          content: "",
        },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tool use (function call requested by model)
  // -------------------------------------------------------------------------
  describe("tool_use block", () => {
    it("maps tool_use to ToolCallRequestPart", () => {
      assert.deepStrictEqual(
        mapBedrockContentBlock({
          type: "tool_use",
          id: "call_abc123",
          name: "get_weather",
          input: { city: "Paris", unit: "celsius" },
        }),
        {
          type: "tool_call",
          id: "call_abc123",
          name: "get_weather",
          arguments: { city: "Paris", unit: "celsius" },
        },
      );
    });

    it("maps tool_use without id", () => {
      const result = mapBedrockContentBlock({
        type: "tool_use",
        name: "search",
        input: { query: "llamas" },
      }) as any;
      assert.strictEqual(result.type, "tool_call");
      assert.strictEqual(result.name, "search");
      assert.deepStrictEqual(result.arguments, { query: "llamas" });
    });
  });

  // -------------------------------------------------------------------------
  // Tool result (client returns function result to model)
  // -------------------------------------------------------------------------
  describe("tool_result block", () => {
    it("maps tool_result with string content to ToolCallResponsePart", () => {
      assert.deepStrictEqual(
        mapBedrockContentBlock({
          type: "tool_result",
          tool_use_id: "call_abc123",
          content: "rainy, 57°F",
        }),
        {
          type: "tool_call_response",
          id: "call_abc123",
          response: "rainy, 57°F",
        },
      );
    });

    it("maps tool_result with array content", () => {
      const contentArray = [{ type: "text", text: "Result data" }];
      const result = mapBedrockContentBlock({
        type: "tool_result",
        tool_use_id: "call_xyz",
        content: contentArray,
      }) as any;
      assert.strictEqual(result.type, "tool_call_response");
      assert.strictEqual(result.id, "call_xyz");
      assert.deepStrictEqual(result.response, contentArray);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown / future block types — GenericPart fallback
  // -------------------------------------------------------------------------
  describe("unknown block types", () => {
    it("preserves unknown type as GenericPart", () => {
      assert.deepStrictEqual(
        mapBedrockContentBlock({ type: "custom_block", data: "some data" }),
        { type: "custom_block", data: "some data" },
      );
    });

    it("preserves all fields from unknown block", () => {
      const block = {
        type: "future_type",
        field1: "a",
        field2: 42,
        nested: { x: 1 },
      };
      assert.deepStrictEqual(mapBedrockContentBlock(block), block);
    });
  });
});
