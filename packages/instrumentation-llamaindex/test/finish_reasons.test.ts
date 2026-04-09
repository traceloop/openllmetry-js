/**
 * Unit tests for openAIFinishReasonMap.
 *
 * Each OpenAI raw finish reason value is tested individually.
 * Verified values from OpenAI API documentation.
 */

import * as assert from "assert";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import { openAIFinishReasonMap } from "../src/custom-llm-instrumentation";

const VALID_OTEL_FINISH_REASONS = new Set([
  FinishReasons.STOP,
  FinishReasons.LENGTH,
  FinishReasons.TOOL_CALL,
  FinishReasons.CONTENT_FILTER,
  FinishReasons.ERROR,
]);

describe("openAIFinishReasonMap", () => {
  it("all mapped values are valid OTel finish reason strings", () => {
    for (const [raw, otel] of Object.entries(openAIFinishReasonMap)) {
      assert.ok(
        VALID_OTEL_FINISH_REASONS.has(otel),
        `openAIFinishReasonMap["${raw}"] = "${otel}" is not a valid OTel finish reason`,
      );
    }
  });

  it('maps "stop" to stop', () => {
    assert.strictEqual(openAIFinishReasonMap["stop"], FinishReasons.STOP);
  });

  it('maps "length" to length', () => {
    assert.strictEqual(openAIFinishReasonMap["length"], FinishReasons.LENGTH);
  });

  it('maps "tool_calls" to tool_call', () => {
    assert.strictEqual(
      openAIFinishReasonMap["tool_calls"],
      FinishReasons.TOOL_CALL,
    );
  });

  it('maps "content_filter" to content_filter', () => {
    assert.strictEqual(
      openAIFinishReasonMap["content_filter"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "function_call" to tool_call (deprecated alias)', () => {
    assert.strictEqual(
      openAIFinishReasonMap["function_call"],
      FinishReasons.TOOL_CALL,
    );
  });
});
