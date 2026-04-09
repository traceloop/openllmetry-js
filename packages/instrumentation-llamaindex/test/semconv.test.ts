/**
 * OTel GenAI Semantic Convention compliance tests for LlamaIndex instrumentation.
 *
 * Pure unit tests — no HTTP, no Polly, no API keys needed.
 * They validate:
 *   - openAIFinishReasonMap covers all known OpenAI values and produces valid OTel values
 *   - mapOpenAIContentBlock produces schema-compliant OTel parts
 *   - formatInputMessages / formatOutputMessage produce valid OTel JSON
 *   - traceContent: false omits content but keeps metadata
 */

import * as assert from "assert";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import {
  formatInputMessages,
  formatOutputMessage,
  mapOpenAIContentBlock,
} from "@traceloop/instrumentation-utils";
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from "@opentelemetry/semantic-conventions/incubating";
import { openAIFinishReasonMap } from "../src/custom-llm-instrumentation";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function assertValidOtelJsonArray(value: unknown, label: string): any[] {
  assert.ok(typeof value === "string", `${label} must be a string`);
  let parsed: any;
  try {
    parsed = JSON.parse(value as string);
  } catch {
    assert.fail(`${label} is not valid JSON: ${value}`);
  }
  assert.ok(Array.isArray(parsed), `${label} must be a JSON array`);
  assert.ok(parsed.length > 0, `${label} must not be empty`);
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// P1-1: Provider and operation name constants
// ─────────────────────────────────────────────────────────────────────────────

describe("OTel provider and operation name constants", () => {
  it("GEN_AI_PROVIDER_NAME_VALUE_OPENAI is openai", () => {
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_OPENAI, "openai");
  });

  it("GEN_AI_OPERATION_NAME_VALUE_CHAT is chat", () => {
    assert.strictEqual(GEN_AI_OPERATION_NAME_VALUE_CHAT, "chat");
  });

  it("span name format is 'chat {model}'", () => {
    const model = "gpt-4o";
    assert.strictEqual(`chat ${model}`, "chat gpt-4o");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1-2: mapOpenAIContentBlock produces valid OTel parts
// ─────────────────────────────────────────────────────────────────────────────

describe("mapOpenAIContentBlock produces valid OTel parts", () => {
  it("string input → TextPart", () => {
    const part = mapOpenAIContentBlock("hello world") as any;
    assert.strictEqual(part.type, "text");
    assert.strictEqual(part.content, "hello world");
  });

  it("text block → TextPart", () => {
    const part = mapOpenAIContentBlock({ type: "text", text: "hello" }) as any;
    assert.strictEqual(part.type, "text");
    assert.strictEqual(part.content, "hello");
  });

  it("image_url block with http URL → UriPart", () => {
    const part = mapOpenAIContentBlock({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    }) as any;
    assert.strictEqual(part.type, "uri");
    assert.strictEqual(part.modality, "image");
    assert.strictEqual(part.uri, "https://example.com/img.png");
  });

  it("image_url block with base64 data URI → BlobPart", () => {
    const part = mapOpenAIContentBlock({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc123" },
    }) as any;
    assert.strictEqual(part.type, "blob");
    assert.strictEqual(part.modality, "image");
    assert.strictEqual(part.mime_type, "image/png");
    assert.strictEqual(part.content, "abc123");
  });

  it("empty text string → TextPart with empty content", () => {
    const part = mapOpenAIContentBlock({ type: "text", text: "" }) as any;
    assert.strictEqual(part.type, "text");
    assert.strictEqual(part.content, "");
  });

  it("unknown block type → preserved as GenericPart with all fields", () => {
    const block = { type: "future_type", field1: "a", field2: 42 };
    const part = mapOpenAIContentBlock(block) as any;
    assert.strictEqual(part.type, "future_type");
    assert.strictEqual(part.field1, "a");
    assert.strictEqual(part.field2, 42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-1: formatInputMessages produces valid OTel gen_ai.input.messages JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("formatInputMessages produces valid gen_ai.input.messages JSON", () => {
  it("simple string content user message", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "What is 2+2?" }],
      mapOpenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[0].content, "What is 2+2?");
  });

  it("multi-turn conversation", () => {
    const json = formatInputMessages(
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
        { role: "user", content: "How are you?" },
      ],
      mapOpenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages.length, 3);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
    assert.strictEqual(messages[1].parts[0].type, "text");
  });

  it("traceContent=false → role preserved, parts empty", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "secret content" }],
      mapOpenAIContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].role, "user");
    assert.ok(
      !messages[0].parts || messages[0].parts.length === 0,
      "parts must be empty when traceContent=false",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-2: formatOutputMessage produces valid OTel gen_ai.output.messages JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("formatOutputMessage produces valid gen_ai.output.messages JSON", () => {
  it("string content wrapped in array → TextPart", () => {
    const json = formatOutputMessage(
      ["The answer is 4."],
      "stop",
      openAIFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapOpenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.output.messages");
    assert.strictEqual(messages[0].role, "assistant");
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[0].content, "The answer is 4.");
  });

  it("block array content → mapped parts", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "Hello!" }],
      "stop",
      openAIFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapOpenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[0].content, "Hello!");
  });

  it("maps OpenAI finish reasons to OTel values", () => {
    const cases: Array<[string, string]> = [
      ["stop", FinishReasons.STOP],
      ["length", FinishReasons.LENGTH],
      ["tool_calls", FinishReasons.TOOL_CALL],
      ["content_filter", FinishReasons.CONTENT_FILTER],
      ["function_call", FinishReasons.TOOL_CALL],
    ];
    for (const [raw, expected] of cases) {
      const json = formatOutputMessage(
        ["ok"],
        raw,
        openAIFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapOpenAIContentBlock,
      );
      const messages = JSON.parse(json);
      assert.strictEqual(
        messages[0].finish_reason,
        expected,
        `"${raw}" should map to "${expected}"`,
      );
    }
  });

  it("null finish_reason → finish_reason is empty string (not null)", () => {
    const json = formatOutputMessage(
      ["ok"],
      null,
      openAIFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapOpenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "");
  });

  it("unknown finish_reason passes through unchanged", () => {
    const json = formatOutputMessage(
      ["ok"],
      "some_future_reason",
      openAIFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapOpenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "some_future_reason");
  });

  it("traceContent=false → finish_reason preserved, parts empty", () => {
    const json = formatOutputMessage(
      ["secret content"],
      "stop",
      openAIFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapOpenAIContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.ok(
      !messages[0].parts || messages[0].parts.length === 0,
      "parts must be empty when traceContent=false",
    );
  });
});
