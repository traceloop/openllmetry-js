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
import { FinishReasons } from "@traceloop/ai-semantic-conventions";
import { genaiFinishReasonMap } from "../src/instrumentation";

const VALID_OTEL_FINISH_REASONS = new Set([
  FinishReasons.STOP,
  FinishReasons.LENGTH,
  FinishReasons.TOOL_CALL,
  FinishReasons.CONTENT_FILTER,
  FinishReasons.ERROR,
  FinishReasons.OTHER,
  FinishReasons.FINISH_REASON_UNSPECIFIED, // "" — when finish reason is unavailable
]);

describe("genaiFinishReasonMap", () => {
  it("all mapped values are valid OTel finish reason strings", () => {
    for (const [vendor, otel] of Object.entries(genaiFinishReasonMap)) {
      assert.ok(
        VALID_OTEL_FINISH_REASONS.has(otel),
        `genaiFinishReasonMap["${vendor}"] = "${otel}" is not a valid OTel finish reason`,
      );
    }
  });

  it('maps "STOP" to stop', () => {
    assert.strictEqual(genaiFinishReasonMap["STOP"], FinishReasons.STOP);
  });

  it('maps "MAX_TOKENS" to length', () => {
    assert.strictEqual(
      genaiFinishReasonMap["MAX_TOKENS"],
      FinishReasons.LENGTH,
    );
  });

  it('maps "SAFETY" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["SAFETY"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "RECITATION" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["RECITATION"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "LANGUAGE" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["LANGUAGE"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "OTHER" to error', () => {
    assert.strictEqual(genaiFinishReasonMap["OTHER"], FinishReasons.ERROR);
  });

  it('maps "BLOCKLIST" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["BLOCKLIST"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "PROHIBITED_CONTENT" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["PROHIBITED_CONTENT"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "SPII" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["SPII"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "MALFORMED_FUNCTION_CALL" to error', () => {
    assert.strictEqual(
      genaiFinishReasonMap["MALFORMED_FUNCTION_CALL"],
      FinishReasons.ERROR,
    );
  });

  it('maps "IMAGE_SAFETY" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["IMAGE_SAFETY"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "FINISH_REASON_UNSPECIFIED" to empty string', () => {
    assert.strictEqual(genaiFinishReasonMap["FINISH_REASON_UNSPECIFIED"], "");
  });

  it('maps "UNEXPECTED_TOOL_CALL" to error', () => {
    assert.strictEqual(
      genaiFinishReasonMap["UNEXPECTED_TOOL_CALL"],
      FinishReasons.ERROR,
    );
  });

  it('maps "IMAGE_PROHIBITED_CONTENT" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["IMAGE_PROHIBITED_CONTENT"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "NO_IMAGE" to error', () => {
    assert.strictEqual(genaiFinishReasonMap["NO_IMAGE"], FinishReasons.ERROR);
  });

  it('maps "IMAGE_RECITATION" to content_filter', () => {
    assert.strictEqual(
      genaiFinishReasonMap["IMAGE_RECITATION"],
      FinishReasons.CONTENT_FILTER,
    );
  });

  it('maps "IMAGE_OTHER" to error', () => {
    assert.strictEqual(
      genaiFinishReasonMap["IMAGE_OTHER"],
      FinishReasons.ERROR,
    );
  });
});
