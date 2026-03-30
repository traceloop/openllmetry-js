import * as assert from "assert";

import { mapOpenAIContentBlock } from "@traceloop/instrumentation-utils";
import {
  buildOpenAIInputMessages,
  buildOpenAIOutputMessage,
  buildOpenAICompletionOutputMessage,
  openaiFinishReasonMap,
} from "../src/message-helpers";

describe("mapOpenAIContentBlock", () => {
  it("maps plain string to TextPart", () => {
    const result = mapOpenAIContentBlock("hello");
    assert.deepStrictEqual(result, { type: "text", content: "hello" });
  });

  it("maps text block to TextPart", () => {
    const result = mapOpenAIContentBlock({ type: "text", text: "hello" });
    assert.deepStrictEqual(result, { type: "text", content: "hello" });
  });

  it("maps image_url (regular URL) to UriPart", () => {
    const result = mapOpenAIContentBlock({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    });
    assert.deepStrictEqual(result, {
      type: "uri",
      modality: "image",
      uri: "https://example.com/img.png",
    });
  });

  it("maps image_url (data URI) to BlobPart", () => {
    const result = mapOpenAIContentBlock({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc123" },
    }) as any;
    assert.strictEqual(result.type, "blob");
    assert.strictEqual(result.modality, "image");
    assert.strictEqual(result.mime_type, "image/png");
    // The base64 data should be present (field name may be `content` or `data`)
    assert.ok(result.content === "abc123" || result.data === "abc123");
  });

  it("maps input_audio to BlobPart", () => {
    const result = mapOpenAIContentBlock({
      type: "input_audio",
      input_audio: { format: "mp3", data: "audiodata" },
    }) as any;
    assert.strictEqual(result.type, "blob");
    assert.strictEqual(result.modality, "audio");
    assert.strictEqual(result.mime_type, "audio/mp3");
    assert.ok(result.content === "audiodata" || result.data === "audiodata");
  });

  it("maps file (file_id) to FilePart", () => {
    const result = mapOpenAIContentBlock({
      type: "file",
      file: { file_id: "f_123", filename: "doc.pdf" },
    });
    assert.deepStrictEqual(result, {
      type: "file",
      file_id: "f_123",
      filename: "doc.pdf",
    });
  });

  it("maps file (file_data) to BlobPart", () => {
    const result = mapOpenAIContentBlock({
      type: "file",
      file: { file_data: "base64data", mime_type: "application/pdf" },
    }) as any;
    assert.strictEqual(result.type, "blob");
    assert.strictEqual(result.mime_type, "application/pdf");
    assert.ok(
      result.content === "base64data" || result.data === "base64data",
    );
    // File data should NOT have modality (documents aren't image/video/audio)
    assert.strictEqual(result.modality, undefined);
  });

  it("maps refusal to GenericPart", () => {
    const result = mapOpenAIContentBlock({
      type: "refusal",
      refusal: "I can't do that",
    });
    assert.deepStrictEqual(result, {
      type: "refusal",
      content: "I can't do that",
    });
  });

  it("maps unknown type to GenericPart (passthrough)", () => {
    const result = mapOpenAIContentBlock({
      type: "custom_thing",
      foo: "bar",
    });
    assert.deepStrictEqual(result, {
      type: "custom_thing",
      foo: "bar",
    });
  });
});

describe("buildOpenAIInputMessages", () => {
  it("maps system message with string content", () => {
    const result = buildOpenAIInputMessages([
      { role: "system", content: "Be helpful" },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "system");
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: "Be helpful" },
    ]);
  });

  it("maps developer message", () => {
    const result = buildOpenAIInputMessages([
      { role: "developer", content: "Instructions here" },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "developer");
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: "Instructions here" },
    ]);
  });

  it("maps user message with string content", () => {
    const result = buildOpenAIInputMessages([
      { role: "user", content: "Hello" },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "user");
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: "Hello" },
    ]);
  });

  it("maps user message with array content (text + image)", () => {
    const result = buildOpenAIInputMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/img.png" },
          },
        ],
      },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "user");
    assert.strictEqual(result[0].parts.length, 2);
    assert.deepStrictEqual(result[0].parts[0], {
      type: "text",
      content: "What is this?",
    });
    assert.deepStrictEqual(result[0].parts[1], {
      type: "uri",
      modality: "image",
      uri: "https://example.com/img.png",
    });
  });

  it("maps assistant message with content and tool_calls", () => {
    const result = buildOpenAIInputMessages([
      {
        role: "assistant",
        content: "Let me check",
        tool_calls: [
          {
            type: "function",
            id: "call_1",
            function: {
              name: "get_weather",
              arguments: '{"city":"NYC"}',
            },
          },
        ],
      },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "assistant");
    assert.strictEqual(result[0].parts.length, 2);
    assert.deepStrictEqual(result[0].parts[0], {
      type: "text",
      content: "Let me check",
    });
    assert.deepStrictEqual(result[0].parts[1], {
      type: "tool_call",
      id: "call_1",
      name: "get_weather",
      arguments: { city: "NYC" },
    });
  });

  it("maps tool message to tool_call_response", () => {
    const result = buildOpenAIInputMessages([
      { role: "tool", tool_call_id: "call_1", content: "72°F, sunny" },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "tool");
    assert.deepStrictEqual(result[0].parts, [
      {
        type: "tool_call_response",
        id: "call_1",
        response: "72°F, sunny",
      },
    ]);
  });

  it("maps deprecated function role to tool role", () => {
    const result = buildOpenAIInputMessages([
      { role: "function", name: "get_weather", content: "72°F" },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "tool");
    assert.deepStrictEqual(result[0].parts, [
      {
        type: "tool_call_response",
        id: "get_weather",
        response: "72°F",
      },
    ]);
  });
});

describe("buildOpenAIOutputMessage", () => {
  it("maps text response with stop finish_reason", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: { role: "assistant", content: "Hello!" },
        finish_reason: "stop",
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "assistant");
    assert.strictEqual(result[0].finish_reason, "stop");
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: "Hello!" },
    ]);
  });

  it("maps tool_calls response with finish_reason mapping", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              type: "function",
              id: "call_1",
              function: {
                name: "get_weather",
                arguments: '{"city":"NYC"}',
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].finish_reason, "tool_call");
    assert.deepStrictEqual(result[0].parts, [
      {
        type: "tool_call",
        id: "call_1",
        name: "get_weather",
        arguments: { city: "NYC" },
      },
    ]);
  });

  it("maps refusal response", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: {
          role: "assistant",
          content: null,
          refusal: "I cannot help with that",
        },
        finish_reason: "stop",
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    const refusalPart = result[0].parts.find(
      (p: any) => p.type === "refusal",
    ) as any;
    assert.ok(refusalPart);
    assert.strictEqual(refusalPart.content, "I cannot help with that");
  });

  it("omits finish_reason when null", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: { role: "assistant", content: "Hi" },
        finish_reason: null,
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].finish_reason, undefined);
    assert.strictEqual("finish_reason" in result[0], false);
  });

  it("passes through unknown finish_reason", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: { role: "assistant", content: "Hi" },
        finish_reason: "custom_reason",
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result[0].finish_reason, "custom_reason");
  });

  it("maps audio response to BlobPart", () => {
    const result = buildOpenAIOutputMessage(
      {
        message: {
          role: "assistant",
          content: null,
          audio: { data: "audiobase64" },
        },
        finish_reason: "stop",
      },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    const audioPart = result[0].parts.find(
      (p: any) => p.type === "blob",
    ) as any;
    assert.ok(audioPart);
    assert.strictEqual(audioPart.modality, "audio");
    assert.strictEqual(audioPart.mime_type, "audio/mp3");
    assert.ok(
      audioPart.content === "audiobase64" || audioPart.data === "audiobase64",
    );
  });
});

describe("buildOpenAICompletionOutputMessage", () => {
  it("maps text completion with finish_reason", () => {
    const result = buildOpenAICompletionOutputMessage(
      { text: "Once upon a time", finish_reason: "stop" },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, "assistant");
    assert.strictEqual(result[0].finish_reason, "stop");
    assert.deepStrictEqual(result[0].parts, [
      { type: "text", content: "Once upon a time" },
    ]);
  });

  it("omits finish_reason when null", () => {
    const result = buildOpenAICompletionOutputMessage(
      { text: "data", finish_reason: null },
      openaiFinishReasonMap,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].finish_reason, undefined);
    assert.strictEqual("finish_reason" in result[0], false);
  });
});
