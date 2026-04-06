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
 * Unit tests for bedrockFinishReasonMap.
 *
 * TDD — these tests define the contract before the map is implemented.
 * They will FAIL until bedrockFinishReasonMap is exported from
 * packages/instrumentation-bedrock/src/instrumentation.ts.
 *
 * Verified finish reason values from real Polly recordings:
 *   AI21:     "endoftext"
 *   Amazon:   "FINISH", "LENGTH", "CONTENT_FILTERED"
 *   Anthropic:"end_turn", "max_tokens", "stop_sequence", "tool_use"
 *   Cohere:   "COMPLETE", "MAX_TOKENS", "ERROR", "ERROR_TOXIC"
 *   Meta:     "stop", "length"
 */

import * as assert from "assert";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import { bedrockFinishReasonMap } from "../src/instrumentation";

const VALID_OTEL_FINISH_REASONS = new Set([
  FinishReasons.STOP, // "stop"
  FinishReasons.LENGTH, // "length"
  FinishReasons.TOOL_CALL, // "tool_call"
  FinishReasons.CONTENT_FILTER, // "content_filter"
  FinishReasons.ERROR, // "error"
]);

describe("bedrockFinishReasonMap", () => {
  // -------------------------------------------------------------------------
  // All values must be valid OTel finish reasons
  // -------------------------------------------------------------------------
  it("all mapped values are valid OTel finish reason strings", () => {
    for (const [vendor, otel] of Object.entries(bedrockFinishReasonMap)) {
      assert.ok(
        VALID_OTEL_FINISH_REASONS.has(otel),
        `bedrockFinishReasonMap["${vendor}"] = "${otel}" is not a valid OTel finish reason`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // AI21
  // -------------------------------------------------------------------------
  describe("AI21", () => {
    it('maps "endoftext" to stop', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["endoftext"],
        FinishReasons.STOP,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Amazon Titan
  // -------------------------------------------------------------------------
  describe("Amazon Titan", () => {
    it('maps "FINISH" to stop', () => {
      assert.strictEqual(bedrockFinishReasonMap["FINISH"], FinishReasons.STOP);
    });

    it('maps "LENGTH" to length', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["LENGTH"],
        FinishReasons.LENGTH,
      );
    });

    it('maps "CONTENT_FILTERED" to content_filter', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["CONTENT_FILTERED"],
        FinishReasons.CONTENT_FILTER,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Anthropic via Bedrock
  // -------------------------------------------------------------------------
  describe("Anthropic", () => {
    it('maps "end_turn" to stop', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["end_turn"],
        FinishReasons.STOP,
      );
    });

    it('maps "max_tokens" to length', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["max_tokens"],
        FinishReasons.LENGTH,
      );
    });

    it('maps "stop_sequence" to stop', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["stop_sequence"],
        FinishReasons.STOP,
      );
    });

    it('maps "tool_use" to tool_call', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["tool_use"],
        FinishReasons.TOOL_CALL,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cohere
  // -------------------------------------------------------------------------
  describe("Cohere", () => {
    it('maps "COMPLETE" to stop', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["COMPLETE"],
        FinishReasons.STOP,
      );
    });

    it('maps "MAX_TOKENS" to length', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["MAX_TOKENS"],
        FinishReasons.LENGTH,
      );
    });

    it('maps "ERROR" to error', () => {
      assert.strictEqual(bedrockFinishReasonMap["ERROR"], FinishReasons.ERROR);
    });

    it('maps "ERROR_TOXIC" to content_filter', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["ERROR_TOXIC"],
        FinishReasons.CONTENT_FILTER,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Meta Llama
  // -------------------------------------------------------------------------
  describe("Meta", () => {
    it('maps "stop" to stop', () => {
      assert.strictEqual(bedrockFinishReasonMap["stop"], FinishReasons.STOP);
    });

    it('maps "length" to length', () => {
      assert.strictEqual(
        bedrockFinishReasonMap["length"],
        FinishReasons.LENGTH,
      );
    });
  });
});
