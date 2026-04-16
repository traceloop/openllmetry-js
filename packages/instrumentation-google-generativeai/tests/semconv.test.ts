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
 * OTel GenAI Semantic Convention compliance tests for Google GenAI instrumentation.
 *
 * These are pure unit tests — no HTTP, no real API calls.
 * They validate:
 *   - genaiFinishReasonMap covers all known Gemini finish reasons
 *   - mapGenAIContentBlock produces schema-compliant OTel parts
 *   - formatInputMessages / formatOutputMessage produce valid OTel JSON
 *   - traceContent: false omits content but preserves metadata
 */

import * as assert from "assert";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import {
  formatInputMessages,
  formatOutputMessage,
} from "@traceloop/instrumentation-utils";
import { mapGenAIContentBlock } from "../src/content-block-mapper";
import { GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT } from "@opentelemetry/semantic-conventions/incubating";
import { genaiFinishReasonMap } from "../src/instrumentation";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function assertValidOtelJsonArray(value: unknown, label: string): unknown[] {
  assert.ok(typeof value === "string", `${label} must be a string`);
  let parsed: unknown;
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
// formatInputMessages with genai content
// ─────────────────────────────────────────────────────────────────────────────

describe("formatInputMessages with genai content blocks", () => {
  it("simple user text message", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "What is 2+2?" }],
      mapGenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[0].parts[0].content, "What is 2+2?");
  });

  it("multi-turn conversation with genai Part[]", () => {
    const json = formatInputMessages(
      [
        { role: "user", content: [{ text: "Hello" }] },
        { role: "assistant", content: [{ text: "Hi there!" }] },
      ],
      mapGenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].parts[0].type, "text");
    assert.strictEqual(messages[1].parts[0].type, "text");
  });

  it("message with functionCall block produces tool_call part", () => {
    const json = formatInputMessages(
      [
        {
          role: "assistant",
          content: [
            {
              functionCall: {
                id: "call-1",
                name: "get_weather",
                args: { city: "Paris" },
              },
            },
          ],
        },
      ],
      mapGenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.input.messages");
    assert.strictEqual(messages[0].parts[0].type, "tool_call");
    assert.strictEqual(messages[0].parts[0].name, "get_weather");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatOutputMessage with genai content
// ─────────────────────────────────────────────────────────────────────────────

describe("formatOutputMessage with genai content blocks", () => {
  it("simple text response with STOP reason", () => {
    const json = formatOutputMessage(
      [{ text: "The answer is 4." }],
      "STOP",
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
    );
    const messages = assertValidOtelJsonArray(json, "gen_ai.output.messages");
    assert.strictEqual(messages[0].role, "assistant");
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.strictEqual(messages[0].parts[0].type, "text");
  });

  it("maps vendor finish reason through genaiFinishReasonMap", () => {
    const cases: Array<[string, string]> = [
      ["STOP", FinishReasons.STOP],
      ["MAX_TOKENS", FinishReasons.LENGTH],
      ["SAFETY", FinishReasons.CONTENT_FILTER],
      ["RECITATION", FinishReasons.CONTENT_FILTER],
      ["OTHER", FinishReasons.ERROR],
    ];

    for (const [vendorReason, expectedOtel] of cases) {
      const json = formatOutputMessage(
        [{ text: "ok" }],
        vendorReason,
        genaiFinishReasonMap,
        GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
        mapGenAIContentBlock,
      );
      const messages = JSON.parse(json);
      assert.strictEqual(
        messages[0].finish_reason,
        expectedOtel,
        `vendor reason "${vendorReason}" should map to "${expectedOtel}"`,
      );
    }
  });

  it("thought: true part produces reasoning part in output", () => {
    const json = formatOutputMessage(
      [
        { text: "Let me think...", thought: true },
        { text: "The answer is 4." },
      ],
      "STOP",
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts[0].type, "reasoning");
    assert.strictEqual(messages[0].parts[1].type, "text");
  });

  it("functionCall part produces tool_call part in output", () => {
    const json = formatOutputMessage(
      [{ functionCall: { id: "call-1", name: "search", args: { q: "test" } } }],
      "STOP",
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].parts[0].type, "tool_call");
    assert.strictEqual(messages[0].parts[0].name, "search");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// finish_reason edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("finish_reason edge cases in formatOutputMessage", () => {
  it("null finish_reason becomes empty string in output message", () => {
    const json = formatOutputMessage(
      [{ text: "ok" }],
      null,
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "");
  });

  it("unknown vendor finish reason passes through unchanged", () => {
    const json = formatOutputMessage(
      [{ text: "ok" }],
      "SOME_FUTURE_REASON",
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, "SOME_FUTURE_REASON");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// traceContent: false — content omitted
// ─────────────────────────────────────────────────────────────────────────────

describe("traceContent false omits content but preserves metadata", () => {
  it("formatInputMessages with traceContent=false returns empty parts", () => {
    const json = formatInputMessages(
      [{ role: "user", content: "secret content" }],
      mapGenAIContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].role, "user");
    assert.ok(!messages[0].parts || messages[0].parts.length === 0);
  });

  it("formatOutputMessage with traceContent=false has finish_reason but no parts", () => {
    const json = formatOutputMessage(
      [{ text: "secret content" }],
      "STOP",
      genaiFinishReasonMap,
      GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      mapGenAIContentBlock,
      false,
    );
    const messages = JSON.parse(json);
    assert.strictEqual(messages[0].finish_reason, FinishReasons.STOP);
    assert.ok(!messages[0].parts || messages[0].parts.length === 0);
  });
});
