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

import { mapAnthropicContentBlock } from "@traceloop/instrumentation-utils";
import {
  formatSystemInstructions,
  formatInputMessages,
  formatInputMessagesFromPrompt,
  formatOutputMessage,
} from "@traceloop/instrumentation-utils";
import { anthropicFinishReasonMap } from "../src/instrumentation";
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from "@opentelemetry/semantic-conventions/incubating";
import fixtures from "./mapper-fixtures.json";

describe("mapAnthropicContentBlock", () => {
  it("maps text block to TextPart", () => {
    const block = fixtures.inputMessages.text_explicit_block[0].content[0];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "text",
      content: "What is the capital of France?",
    });
  });

  it("maps image/base64 block to BlobPart", () => {
    const block = fixtures.inputMessages.image_base64[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "blob",
      modality: "image",
      mime_type: "image/png",
      content:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
  });

  it("maps image/url block to UriPart", () => {
    const block = fixtures.inputMessages.image_url[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "uri",
      modality: "image",
      uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
    });
  });

  it("maps document/text source to TextPart", () => {
    const block = fixtures.inputMessages.document_text_source[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "text",
      content: "The quick brown fox jumps over the lazy dog.",
    });
  });

  it("maps document/base64 to BlobPart with mime_type from block", () => {
    const block = fixtures.inputMessages.document_base64_pdf[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "blob",
      modality: "document",
      mime_type: "application/pdf",
      content:
        "JVBERi0xLjAKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCg==",
    });
  });

  it("maps document/url to UriPart", () => {
    const block = fixtures.inputMessages.document_url[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "uri",
      modality: "document",
      mime_type: "application/pdf",
      uri: "https://assets.anthropic.com/m/1cd9d098ac3e6467/original/Claude-3-Model-Card-October-Addendum.pdf",
    });
  });

  it("maps document/file to FilePart", () => {
    const block = fixtures.inputMessages.document_file_id[0].content[1];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "file",
      modality: "document",
      file_id: "file_011CNha8iCJcU1wXNR6q4V8w",
    });
  });

  it("maps tool_use to ToolCallRequestPart", () => {
    const block =
      fixtures.inputMessages.tool_use_replayed_in_assistant[1].content[0];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "tool_call",
      id: "call_abc123",
      name: "get_weather",
      arguments: { city: "Paris", unit: "celsius" },
    });
  });

  it("maps tool_result (string content) to ToolCallResponsePart", () => {
    const block =
      fixtures.inputMessages.tool_use_replayed_in_assistant[2].content[0];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "tool_call_response",
      id: "call_abc123",
      response: "Rainy, 14°C",
    });
  });

  it("maps tool_result (array content) to ToolCallResponsePart", () => {
    const block =
      fixtures.inputMessages.tool_result_with_array_content[2].content[0];
    const result = mapAnthropicContentBlock(block);
    const expected = {
      type: "tool_call_response",
      id: "call_def456",
      response:
        fixtures.inputMessages.tool_result_with_array_content[2].content[0]
          .content,
    };
    assert.deepStrictEqual(result, expected);
  });

  it('maps thinking block to ReasoningPart with type "reasoning"', () => {
    const block = fixtures.outputMessages.thinking_then_text[0];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "reasoning",
      content:
        "The user is asking about France's capital. This is a straightforward factual question. Paris has been the capital since...",
    });
  });

  it("maps redacted_thinking to GenericPart without data field", () => {
    const block = fixtures.outputMessages.redacted_thinking_then_text[0];
    const result = mapAnthropicContentBlock(block) as any;
    assert.deepStrictEqual(result, { type: "redacted_thinking" });
    assert.strictEqual(result.data, undefined);
  });

  it("maps server_tool_use to ServerToolCallPart", () => {
    const block = fixtures.outputMessages.server_tool_use_web_search[0];
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "server_tool_call",
      id: "srvtool_001",
      name: "web_search",
      server_tool_call: { type: "web_search", query: "Anthropic founded year" },
    });
  });

  it("maps string input to TextPart", () => {
    const result = mapAnthropicContentBlock("hello");
    assert.deepStrictEqual(result, { type: "text", content: "hello" });
  });

  it("maps unknown block type as GenericPart preserving all fields", () => {
    const result = mapAnthropicContentBlock({
      type: "custom_type",
      foo: "bar",
      baz: 42,
    });
    assert.deepStrictEqual(result, {
      type: "custom_type",
      foo: "bar",
      baz: 42,
    });
  });

  it("document/base64 does NOT hardcode mime_type — reads from source.media_type", () => {
    const block = {
      type: "document",
      source: { type: "base64", media_type: "text/plain", data: "aGVsbG8=" },
    };
    const result = mapAnthropicContentBlock(block);
    assert.deepStrictEqual(result, {
      type: "blob",
      modality: "document",
      mime_type: "text/plain",
      content: "aGVsbG8=",
    });
  });

  it("document/base64 result has modality: document", () => {
    const block = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "abc" },
    };
    const result = mapAnthropicContentBlock(block) as any;
    assert.strictEqual(result.modality, "document");
  });

;  it("document/file result has modality: document", () => {
    const block = {
      type: "document",
      source: { type: "file", file_id: "file_abc" },
    };
    const result = mapAnthropicContentBlock(block) as any;
    assert.strictEqual(result.modality, "document");
  });

  it('thinking block maps to type "reasoning" — never "thinking"', () => {
    const block = { type: "thinking", thinking: "some thought" };
    const result = mapAnthropicContentBlock(block) as any;
    assert.strictEqual(result.type, "reasoning");
    assert.notStrictEqual(result.type, "thinking");
  });

  it("redacted_thinking does NOT include the data field", () => {
    const block = { type: "redacted_thinking", data: "EncryptedBlob" };
    const result = mapAnthropicContentBlock(block) as any;
    assert.strictEqual(result.data, undefined);
  });
});

describe("formatSystemInstructions", () => {
  it("formats plain string as single TextPart array", () => {
    const result = JSON.parse(
      formatSystemInstructions(fixtures.systemInstructions.plain_string),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["systemInstructions.plain_string"],
    );
  });

  it("formats single text block array", () => {
    const result = JSON.parse(
      formatSystemInstructions(fixtures.systemInstructions.single_text_block),
    );
    assert.deepStrictEqual(result, [
      { type: "text", content: "You are a helpful assistant." },
    ]);
  });

  it("formats multiple text blocks preserving order", () => {
    const result = JSON.parse(
      formatSystemInstructions(
        fixtures.systemInstructions.multiple_text_blocks,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["systemInstructions.multiple_text_blocks"],
    );
  });

  it("preserves unknown block types as GenericPart", () => {
    const result = JSON.parse(
      formatSystemInstructions(
        fixtures.systemInstructions.mixed_with_unknown_block,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["systemInstructions.mixed_with_unknown_block"],
    );
  });

  it("returns a valid JSON string (not an object)", () => {
    const raw = formatSystemInstructions("hello");
    assert.strictEqual(typeof raw, "string");
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  it("does NOT wrap in a message object — result is a flat array of parts", () => {
    const result = JSON.parse(formatSystemInstructions("hello"));
    assert.ok(Array.isArray(result));
    assert.strictEqual((result[0] as any).role, undefined);
    assert.strictEqual((result[0] as any).parts, undefined);
  });
});

describe("formatInputMessages", () => {
  it("formats string shorthand content as single TextPart", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.text_string_shorthand,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.text_string_shorthand"],
    );
  });

  it("formats text explicit block", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.text_explicit_block,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(result[0].parts[0], {
      type: "text",
      content: "What is the capital of France?",
    });
  });

  it("formats image/base64 as BlobPart with modality", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.image_base64,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.image_base64"],
    );
  });

  it("formats image/url as UriPart with modality", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.image_url,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.image_url"],
    );
  });

  it("formats document/text source as TextPart", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.document_text_source,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.document_text_source"],
    );
  });

  it("formats document/base64 as BlobPart — mime_type from block not hardcoded", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.document_base64_pdf,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.document_base64_pdf"],
    );
  });

  it("formats document/url as UriPart", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.document_url,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.document_url"],
    );
  });

  it("formats document/file as FilePart with file_id", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.document_file_id,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.document_file_id"],
    );
  });

  it("formats multi-turn with tool_use and tool_result", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.tool_use_replayed_in_assistant,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["inputMessages.tool_use_replayed_in_assistant"],
    );
  });

  it("formats tool_result with array content — passes array through as response", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.tool_result_with_array_content,
        mapAnthropicContentBlock,
      ),
    );
    const toolResultPart = result[2].parts[0];
    assert.strictEqual(toolResultPart.type, "tool_call_response");
    assert.ok(Array.isArray(toolResultPart.response));
    assert.strictEqual(toolResultPart.response.length, 2);
  });

  it("preserves role on each message", () => {
    const result = JSON.parse(
      formatInputMessages(
        fixtures.inputMessages.multi_turn_mixed_blocks,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].role, "user");
    assert.strictEqual(result[1].role, "assistant");
    assert.strictEqual(result[2].role, "user");
  });

  it("returns valid JSON string", () => {
    const raw = formatInputMessages(
      fixtures.inputMessages.text_string_shorthand,
      mapAnthropicContentBlock,
    );
    assert.strictEqual(typeof raw, "string");
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  describe("formatInputMessagesFromPrompt", () => {
    it("wraps prompt as single user message with TextPart", () => {
      const result = JSON.parse(
        formatInputMessagesFromPrompt("Summarise this document."),
      );
      assert.deepStrictEqual(result, [
        {
          role: "user",
          parts: [{ type: "text", content: "Summarise this document." }],
        },
      ]);
    });

    it("returns a JSON string", () => {
      const raw = formatInputMessagesFromPrompt("hello");
      assert.strictEqual(typeof raw, "string");
      assert.doesNotThrow(() => JSON.parse(raw));
    });
  });
});

describe("formatOutputMessage", () => {
  it("formats text-only response", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["outputMessages.text_only"],
    );
  });

  it("maps stop_reason via finishReasonMap — end_turn becomes stop", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].finish_reason, "stop");
  });

  it("maps stop_reason via finishReasonMap — tool_use becomes tool_call", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.tool_use_single,
        "tool_use",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].finish_reason, "tool_call");
  });

  it("passes unknown stop_reason through unchanged", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        "some_unknown_reason",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].finish_reason, "some_unknown_reason");
  });

  it("sets finish_reason to empty string when stopReason is null", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        null,
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].finish_reason, "");
  });

  it("formats tool_use output as ToolCallRequestPart", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.tool_use_single,
        "tool_use",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["outputMessages.tool_use_single"],
    );
  });

  it("formats multiple tool_use blocks", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.tool_use_multiple,
        "tool_use",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].parts.length, 2);
    assert.strictEqual(result[0].parts[0].type, "tool_call");
    assert.strictEqual(result[0].parts[1].type, "tool_call");
  });

  it('formats thinking + text — thinking maps to type "reasoning"', () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.thinking_then_text,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["outputMessages.thinking_then_text"],
    );
    assert.strictEqual(result[0].parts[0].type, "reasoning");
    assert.notStrictEqual(result[0].parts[0].type, "thinking");
  });

  it("formats redacted_thinking — data field is NOT present in output", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.redacted_thinking_then_text,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["outputMessages.redacted_thinking_then_text"],
    );
    assert.strictEqual((result[0].parts[0] as any).data, undefined);
  });

  it("formats server_tool_use as ServerToolCallPart", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.server_tool_use_web_search,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(
      result,
      fixtures.expectedOutputs["outputMessages.server_tool_use_web_search"],
    );
  });

  it("formats string content for text_completion type", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_completion_string,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: fixtures.outputMessages.text_completion_string },
    ]);
  });

  it("returns empty parts array when type is chat but content is a string", () => {
    const result = JSON.parse(
      formatOutputMessage(
        "some string",
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.deepStrictEqual(result[0].parts, []);
  });

  it("always wraps result in an array of exactly one OutputMessage", () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 1);
  });

  it('output message always has role "assistant"', () => {
    const result = JSON.parse(
      formatOutputMessage(
        fixtures.outputMessages.text_only,
        "end_turn",
        anthropicFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapAnthropicContentBlock,
      ),
    );
    assert.strictEqual(result[0].role, "assistant");
  });

  it("returns valid JSON string", () => {
    const raw = formatOutputMessage(
      fixtures.outputMessages.text_only,
      "end_turn",
      anthropicFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapAnthropicContentBlock,
    );
    assert.strictEqual(typeof raw, "string");
    assert.doesNotThrow(() => JSON.parse(raw));
  });
});
