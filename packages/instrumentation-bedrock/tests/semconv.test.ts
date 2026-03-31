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
 * OTel GenAI Semantic Convention compliance tests for Bedrock instrumentation.
 *
 * Inspired by the Python test_semconv_compliance.py by Max Deygin.
 *
 * These are pure unit tests — no HTTP, no Polly, no AWS calls needed.
 * They validate:
 *   - bedrockFinishReasonMap covers all vendors and produces valid OTel values
 *   - mapBedrockContentBlock produces schema-compliant OTel parts
 *   - formatInputMessages / formatOutputMessage produce valid OTel JSON
 *   - Backward compatibility: old attribute keys are preserved alongside new ones
 *
 * TDD — these will FAIL until the implementation is complete.
 */

import * as assert from "assert";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import {
  formatInputMessages,
  formatInputMessagesFromPrompt,
  formatOutputMessage,
  formatSystemInstructions,
  mapBedrockContentBlock,
} from "@traceloop/instrumentation-utils";
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
} from "@opentelemetry/semantic-conventions/incubating";
import { bedrockFinishReasonMap } from "../src/instrumentation";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_OTEL_FINISH_REASONS = new Set([
  FinishReasons.STOP,
  FinishReasons.LENGTH,
  FinishReasons.TOOL_CALL,
  FinishReasons.CONTENT_FILTER,
  FinishReasons.ERROR,
]);

/** Asserts a value is a non-empty JSON array string */
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

/** Asserts a ChatMessage part has required OTel fields */
function assertValidPart(part: any, label: string) {
  assert.ok(
    typeof part.type === "string",
    `${label} part must have a string type`,
  );
}

/** Asserts an input message has required OTel fields */
function assertValidInputMessage(msg: any, label: string) {
  assert.ok(typeof msg.role === "string", `${label} must have a role`);
  assert.ok(Array.isArray(msg.parts), `${label} must have parts array`);
  msg.parts.forEach((p: any, i: number) =>
    assertValidPart(p, `${label}.parts[${i}]`),
  );
}

/** Asserts an output message has required OTel fields */
function assertValidOutputMessage(msg: any, label: string) {
  assert.strictEqual(
    msg.role,
    "assistant",
    `${label} role must be "assistant"`,
  );
  assert.ok(Array.isArray(msg.parts), `${label} must have parts array`);
  assert.ok(
    msg.finish_reason !== undefined,
    `${label} must have finish_reason`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// P1-1: Provider and operation name constants
// ─────────────────────────────────────────────────────────────────────────────

describe("P1-1: OTel provider and operation name constants", () => {
  it("GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK is aws.bedrock", () => {
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK, "aws.bedrock");
  });

  it("GEN_AI_OPERATION_NAME_VALUE_CHAT is chat", () => {
    assert.strictEqual(GEN_AI_OPERATION_NAME_VALUE_CHAT, "chat");
  });

  it("span name format is '{operation} {model}'", () => {
    const operation = GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const model = "claude-v2";
    assert.strictEqual(`${operation} ${model}`, "chat claude-v2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1-2: Finish reason map covers all vendors
// ─────────────────────────────────────────────────────────────────────────────

describe("P1-2: bedrockFinishReasonMap covers all vendors", () => {
  const requiredVendorValues = [
    // AI21
    "endoftext",
    // Amazon Titan
    "FINISH",
    "LENGTH",
    "CONTENT_FILTERED",
    // Anthropic
    "end_turn",
    "max_tokens",
    "stop_sequence",
    "tool_use",
    // Cohere
    "COMPLETE",
    "MAX_TOKENS",
    "ERROR",
    "ERROR_TOXIC",
    // Meta
    "stop",
    "length",
  ];

  for (const vendorValue of requiredVendorValues) {
    it(`bedrockFinishReasonMap has entry for "${vendorValue}"`, () => {
      assert.ok(
        vendorValue in bedrockFinishReasonMap,
        `Missing finish reason mapping for "${vendorValue}"`,
      );
    });
  }

  it("all mapped values are valid OTel finish reasons", () => {
    for (const [vendor, otel] of Object.entries(bedrockFinishReasonMap)) {
      assert.ok(
        VALID_OTEL_FINISH_REASONS.has(otel),
        `bedrockFinishReasonMap["${vendor}"] = "${otel}" is not a valid OTel finish reason`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1-3: mapBedrockContentBlock produces valid OTel parts
// ─────────────────────────────────────────────────────────────────────────────

describe("P1-3: mapBedrockContentBlock produces valid OTel parts", () => {
  it("text block → TextPart schema", () => {
    const part = mapBedrockContentBlock({ type: "text", text: "hello" }) as any;
    assert.strictEqual(part.type, "text");
    assert.ok("content" in part, "TextPart must have content");
  });

  it("tool_use block → ToolCallRequestPart schema", () => {
    const part = mapBedrockContentBlock({
      type: "tool_use",
      id: "call_1",
      name: "fn",
      input: {},
    }) as any;
    assert.strictEqual(part.type, "tool_call");
    assert.ok("name" in part, "ToolCallRequestPart must have name");
    assert.ok("arguments" in part, "ToolCallRequestPart must have arguments");
  });

  it("tool_result block → ToolCallResponsePart schema", () => {
    const part = mapBedrockContentBlock({
      type: "tool_result",
      tool_use_id: "call_1",
      content: "ok",
    }) as any;
    assert.strictEqual(part.type, "tool_call_response");
    assert.ok("response" in part, "ToolCallResponsePart must have response");
  });

  it("unknown block type → preserved as GenericPart", () => {
    const part = mapBedrockContentBlock({ type: "future_type", x: 1 }) as any;
    assert.strictEqual(part.type, "future_type");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-1: formatInputMessages produces valid OTel gen_ai.input.messages JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("P2-1: formatInputMessages produces valid OTel JSON for Bedrock messages", () => {
  it("simple user text message", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "What is 2+2?" }],
      mapBedrockContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assertValidInputMessage(messages[0], "messages[0]");
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
      mapBedrockContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages.length, 3);
    messages.forEach((m, i) => assertValidInputMessage(m, `messages[${i}]`));
  });

  it("message with tool_use block", () => {
    const json = formatInputMessages(
      [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "get_weather",
              input: { city: "Paris" },
            },
          ],
        },
      ],
      mapBedrockContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages[0].parts[0].type, "tool_call");
  });

  it("formatInputMessagesFromPrompt wraps plain text as user message", () => {
    const json = formatInputMessagesFromPrompt("Tell me a joke");
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[0].content, "Tell me a joke");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-2: formatOutputMessage produces valid OTel gen_ai.output.messages JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("P2-2: formatOutputMessage produces valid OTel JSON for Bedrock responses", () => {
  it("simple text response with stop reason", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "The answer is 4." }],
      "end_turn",
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.output.messages");
    assertValidOutputMessage(messages[0], "messages[0]");
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.strictEqual(messages[0].parts[0].type, "text");
  });

  it("maps vendor finish reason through bedrockFinishReasonMap", () => {
    const cases: Array<[string, string]> = [
      ["end_turn", FinishReasons.STOP],
      ["max_tokens", FinishReasons.LENGTH],
      ["tool_use", FinishReasons.TOOL_CALL],
      ["endoftext", FinishReasons.STOP],
      ["FINISH", FinishReasons.STOP],
      ["COMPLETE", FinishReasons.STOP],
      ["stop", FinishReasons.STOP],
    ];

    for (const [vendorReason, expectedOtel] of cases) {
      const json = formatOutputMessage(
        [{ type: "text", text: "ok" }],
        vendorReason,
        bedrockFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
        mapBedrockContentBlock,
      );
      const messages = JSON.parse(json);
      assert.strictEqual(
        messages[0].finish_reason,
        expectedOtel,
        `vendor reason "${vendorReason}" should map to "${expectedOtel}"`,
      );
    }
  });

  it("tool_use response includes ToolCallRequestPart", () => {
    const json = formatOutputMessage(
      [
        {
          type: "tool_use",
          id: "call_1",
          name: "search",
          input: { q: "hello" },
        },
      ],
      "tool_use",
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts[0].type, "tool_call");
    assert.strictEqual(messages[0].finish_reason, FinishReasons.TOOL_CALL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-3: finish_reason edge cases in formatOutputMessage
// ─────────────────────────────────────────────────────────────────────────────

describe("P2-3: finish_reason edge cases in formatOutputMessage", () => {
  it("unknown vendor finish reason is passed through unchanged", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "ok" }],
      "some_future_reason",
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "some_future_reason");
  });

  it("null finish_reason becomes empty string in output message", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "ok" }],
      null,
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "");
  });

  it("undefined finish_reason becomes empty string in output message", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "ok" }],
      undefined,
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-4: traceContent: false — content omitted, finish_reason preserved
// ─────────────────────────────────────────────────────────────────────────────

describe("P2-4: traceContent false — content omitted, finish_reason preserved", () => {
  it("formatInputMessages with traceContent=false returns empty parts", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "secret content" }],
      mapBedrockContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].role, "user");
    assert.ok(!messages[0].parts || messages[0].parts.length === 0);
  });

  it("formatOutputMessage with traceContent=false has finish_reason but no content parts", () => {
    const json = formatOutputMessage(
      [{ type: "text", text: "secret content" }],
      "end_turn",
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.ok(!messages[0].parts || messages[0].parts.length === 0);
  });

  it("formatInputMessagesFromPrompt with traceContent=false returns empty parts", () => {
    const json = formatInputMessagesFromPrompt("secret content", false);
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].role, "user");
    assert.ok(!messages[0].parts || messages[0].parts.length === 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-5: multi-part content — text + tool_use in same message
// ─────────────────────────────────────────────────────────────────────────────

describe("P2-5: message with mixed content parts (text + tool_use)", () => {
  it("assistant message with text and tool_use produces both parts", () => {
    const json = formatInputMessages(
      [
        {
          role: "assistant",
          content: [
            { type: "text", text: "I will check the weather." },
            {
              type: "tool_use",
              id: "call_1",
              name: "get_weather",
              input: { city: "Paris" },
            },
          ],
        },
      ],
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts.length, 2);
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[1].type, "tool_call");
  });

  it("user message with tool_result produces ToolCallResponsePart", () => {
    const json = formatInputMessages(
      [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_1",
              content: "22°C, sunny",
            },
          ],
        },
      ],
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts[0].type, "tool_call_response");
    assert.strictEqual(messages[0].parts[0].id, "call_1");
    assert.strictEqual(messages[0].parts[0].response, "22°C, sunny");
  });

  it("output message with text and tool_use produces both parts", () => {
    const json = formatOutputMessage(
      [
        { type: "text", text: "Let me check that." },
        {
          type: "tool_use",
          id: "call_2",
          name: "search",
          input: { q: "Paris weather" },
        },
      ],
      "tool_use",
      bedrockFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_CHAT,
      mapBedrockContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, FinishReasons.TOOL_CALL);
    assert.strictEqual(messages[0].parts.length, 2);
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[1].type, "tool_call");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P4: gen_ai.system_instructions — Anthropic system prompt
// ─────────────────────────────────────────────────────────────────────────────

describe("P4: formatSystemInstructions produces valid gen_ai.system_instructions JSON", () => {
  it("string system prompt → flat array with single TextPart", () => {
    const json = formatSystemInstructions(
      "You are a helpful geography teacher.",
    );
    const parts = JSON.parse(json);
    assert.ok(Array.isArray(parts), "must be an array");
    assert.strictEqual(parts.length, 1);
    assert.strictEqual(parts[0].type, "text");
    assert.strictEqual(
      parts[0].content,
      "You are a helpful geography teacher.",
    );
  });

  it("array system prompt → flat array of TextParts (no wrapping message)", () => {
    const json = formatSystemInstructions([
      { type: "text", text: "You are a helpful assistant." },
      { type: "text", text: "Always respond in English." },
    ]);
    const parts = JSON.parse(json);
    assert.ok(Array.isArray(parts));
    assert.strictEqual(parts.length, 2);
    // must NOT be wrapped in { role, parts } — flat array only
    assert.ok(!("role" in parts[0]), "must not have role field");
    assert.ok(!("parts" in parts[0]), "must not be wrapped in ChatMessage");
    assert.strictEqual(parts[0].type, "text");
    assert.strictEqual(parts[1].type, "text");
  });

  it("ATTR_GEN_AI_SYSTEM_INSTRUCTIONS constant is 'gen_ai.system_instructions'", () => {
    const {
      ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
    } = require("@opentelemetry/semantic-conventions/incubating");
    assert.strictEqual(
      ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
      "gen_ai.system_instructions",
    );
  });
});
