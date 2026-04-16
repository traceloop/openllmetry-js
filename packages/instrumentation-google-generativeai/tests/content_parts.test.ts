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
import { mapGenAIContentBlock } from "../src/content-block-mapper";

describe("mapGenAIContentBlock", () => {
  describe("plain string input", () => {
    it("maps a plain string to TextPart", () => {
      assert.deepStrictEqual(mapGenAIContentBlock("hello"), {
        type: "text",
        content: "hello",
      });
    });
  });

  describe("text parts", () => {
    it("maps text part", () => {
      assert.deepStrictEqual(mapGenAIContentBlock({ text: "hello world" }), {
        type: "text",
        content: "hello world",
      });
    });

    it("maps thought: true text part to reasoning part", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          text: "Let me think about this...",
          thought: true,
        }),
        { type: "reasoning", content: "Let me think about this..." },
      );
    });

    it("maps thought: true without text to reasoning part with empty content", () => {
      const result = mapGenAIContentBlock({ thought: true }) as Record<
        string,
        unknown
      >;
      assert.strictEqual(result.type, "reasoning");
      assert.strictEqual(result.content, "");
    });
  });

  describe("inlineData (blob) parts", () => {
    it("maps inlineData image to blob part", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          inlineData: { data: "base64data", mimeType: "image/png" },
        }),
        {
          type: "blob",
          modality: "image",
          mime_type: "image/png",
          content: "base64data",
        },
      );
    });

    it("maps inlineData audio to blob part", () => {
      const result = mapGenAIContentBlock({
        inlineData: { data: "audiodata", mimeType: "audio/mp3" },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "blob");
      assert.strictEqual(result.modality, "audio");
    });

    it("maps inlineData video to blob part", () => {
      const result = mapGenAIContentBlock({
        inlineData: { data: "videodata", mimeType: "video/mp4" },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "blob");
      assert.strictEqual(result.modality, "video");
      assert.strictEqual(result.mime_type, "video/mp4");
    });

    it("maps inlineData without mimeType — uses document modality fallback", () => {
      const result = mapGenAIContentBlock({
        inlineData: { data: "rawdata" },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "blob");
      assert.strictEqual(result.content, "rawdata");
      assert.strictEqual(result.modality, "document");
      assert.strictEqual(result.mime_type, undefined);
    });
  });

  describe("fileData (uri) parts", () => {
    it("maps fileData to uri part", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          fileData: {
            fileUri: "gs://bucket/file.pdf",
            mimeType: "application/pdf",
          },
        }),
        {
          type: "uri",
          modality: "document",
          mime_type: "application/pdf",
          uri: "gs://bucket/file.pdf",
        },
      );
    });

    it("maps fileData video to uri part with modality video", () => {
      const result = mapGenAIContentBlock({
        fileData: { fileUri: "gs://bucket/clip.mp4", mimeType: "video/mp4" },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "uri");
      assert.strictEqual(result.modality, "video");
      assert.strictEqual(result.mime_type, "video/mp4");
      assert.strictEqual(result.uri, "gs://bucket/clip.mp4");
    });
  });

  describe("functionCall (tool_call) parts", () => {
    it("maps functionCall to tool_call part (with id)", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          functionCall: {
            id: "call-123",
            name: "get_weather",
            args: { city: "Paris" },
          },
        }),
        {
          type: "tool_call",
          id: "call-123",
          name: "get_weather",
          arguments: { city: "Paris" },
        },
      );
    });

    it("maps functionCall to tool_call part (no id)", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          functionCall: { name: "get_weather", args: { city: "Paris" } },
        }),
        {
          type: "tool_call",
          id: null,
          name: "get_weather",
          arguments: { city: "Paris" },
        },
      );
    });
  });

  describe("functionResponse (tool_call_response) parts", () => {
    it("maps functionResponse to tool_call_response part (id for correlation)", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          functionResponse: {
            id: "call-123",
            name: "get_weather",
            response: { temp: 20 },
          },
        }),
        {
          type: "tool_call_response",
          id: "call-123",
          response: JSON.stringify({ temp: 20 }),
        },
      );
    });

    it("maps functionResponse to tool_call_response part (no id)", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          functionResponse: { name: "get_weather", response: { temp: 20 } },
        }),
        {
          type: "tool_call_response",
          id: null,
          response: JSON.stringify({ temp: 20 }),
        },
      );
    });

    it("maps functionResponse with undefined response to response: null", () => {
      const result = mapGenAIContentBlock({
        functionResponse: { id: "call-1", name: "get_weather" },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "tool_call_response");
      assert.strictEqual(result.response, null);
    });

    it("maps functionResponse with string response — does not serialize string", () => {
      const result = mapGenAIContentBlock({
        functionResponse: {
          id: "call-1",
          name: "get_weather",
          response: "sunny",
        },
      }) as Record<string, unknown>;
      assert.strictEqual(result.type, "tool_call_response");
      assert.strictEqual(result.response, "sunny");
    });
  });

  describe("code execution parts", () => {
    it("maps executableCode to executable_code part", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          executableCode: { language: "PYTHON", code: "print('hello')" },
        }),
        {
          type: "executable_code",
          language: "PYTHON",
          content: "print('hello')",
        },
      );
    });

    it("maps codeExecutionResult to code_execution_result part", () => {
      assert.deepStrictEqual(
        mapGenAIContentBlock({
          codeExecutionResult: { outcome: "OUTCOME_OK", output: "hello" },
        }),
        {
          type: "code_execution_result",
          outcome: "OUTCOME_OK",
          content: "hello",
        },
      );
    });
  });

  describe("unknown block types", () => {
    it("maps unknown block to generic part", () => {
      const result = mapGenAIContentBlock({ someField: "value" }) as Record<
        string,
        unknown
      >;
      assert.strictEqual(result.type, "unknown");
    });
  });
});
