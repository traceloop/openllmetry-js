import * as assert from "assert";
import {
  normalizeTaskOutput,
  validateAndNormalizeTaskOutput,
  getFieldSynonyms,
  getFieldSuggestions,
  formatFieldHelp,
} from "../src/lib/client/evaluator/field-mapping";

describe("field-mapping", () => {
  describe("getFieldSynonyms", () => {
    it("returns the full synonym group for a known field", () => {
      const synonyms = getFieldSynonyms("completion");
      assert.ok(synonyms.has("completion"));
      assert.ok(synonyms.has("answer"));
      assert.ok(synonyms.has("text"));
      assert.ok(synonyms.has("response"));
    });

    it("returns a singleton set for an unknown field", () => {
      const synonyms = getFieldSynonyms("custom_field");
      assert.deepStrictEqual([...synonyms], ["custom_field"]);
    });

    it("any member of a group returns the same group", () => {
      const fromCompletion = getFieldSynonyms("completion");
      const fromAnswer = getFieldSynonyms("answer");
      assert.deepStrictEqual(
        [...fromCompletion].sort(),
        [...fromAnswer].sort(),
      );
    });
  });

  describe("normalizeTaskOutput — synonym switch", () => {
    it("moves value from synonym key to required key, and removes the original", () => {
      // Task returns 'completion', evaluator requires 'answer'.
      // Value must move to 'answer'; 'completion' must be removed.
      const out = normalizeTaskOutput(
        { completion: "Paris", context: "France...", question: "Capital?" },
        ["answer", "context", "question"],
      );
      assert.strictEqual(out.answer, "Paris");
      assert.ok(!("completion" in out), "original synonym key must be removed");
      assert.strictEqual(out.context, "France...");
      assert.strictEqual(out.question, "Capital?");
    });

    it("moves value from 'answer' to 'completion' in the reverse direction", () => {
      const out = normalizeTaskOutput(
        { answer: "Paris", context: "France...", question: "Capital?" },
        ["completion", "context", "question"],
      );
      assert.strictEqual(out.completion, "Paris");
      assert.ok(!("answer" in out), "original synonym key must be removed");
    });

    it("moves 'response' to 'completion' and removes 'response'", () => {
      const out = normalizeTaskOutput(
        { response: "hello", context: "ctx", prompt: "ask" },
        ["completion", "reference", "question"],
      );
      assert.strictEqual(out.completion, "hello");
      assert.ok(!("response" in out));
      assert.strictEqual(out.reference, "ctx");
      assert.ok(!("context" in out));
      assert.strictEqual(out.question, "ask");
      assert.ok(!("prompt" in out));
    });
  });

  describe("normalizeTaskOutput — exact match beats synonym", () => {
    it("when both 'completion' and 'answer' are present and 'completion' is required, exact match wins and 'answer' is NOT removed", () => {
      // User returned both keys explicitly. No switch should happen.
      // 'completion' is matched exactly; 'answer' was never consumed as synonym.
      const out = normalizeTaskOutput(
        { completion: "exact", answer: "also-present", context: "ctx" },
        ["completion", "context"],
      );
      assert.strictEqual(out.completion, "exact");
      assert.ok(
        "answer" in out,
        "'answer' must survive because it was not consumed as synonym",
      );
      assert.strictEqual(out.answer, "also-present");
    });

    it("extra fields not involved in any mapping are preserved as-is", () => {
      const out = normalizeTaskOutput(
        { text: "hello", custom_score: 0.9, metadata: "x" },
        ["text"],
      );
      assert.strictEqual(out.text, "hello");
      assert.strictEqual(out.custom_score, 0.9);
      assert.strictEqual(out.metadata, "x");
    });
  });

  describe("validateAndNormalizeTaskOutput", () => {
    it("accepts synonym and returns normalized output without error", () => {
      const result = validateAndNormalizeTaskOutput(
        { completion: "Paris", context: "France...", question: "Capital?" },
        [
          {
            name: "faithfulness",
            requiredInputFields: ["answer", "context", "question"],
          },
        ],
      );
      assert.strictEqual(result.answer, "Paris");
      assert.ok(!("completion" in result));
    });

    it("passes through when no evaluators have requiredInputFields", () => {
      const input = { whatever: "x" };
      const result = validateAndNormalizeTaskOutput(input, [
        { name: "slug-only" },
      ]);
      assert.strictEqual(result, input);
    });

    it("passes through for empty evaluator list", () => {
      const input = { foo: "bar" };
      const result = validateAndNormalizeTaskOutput(input, []);
      assert.strictEqual(result, input);
    });

    it("throws a detailed error when required field is missing with no synonym", () => {
      assert.throws(
        () =>
          validateAndNormalizeTaskOutput({ completion: "x" }, [
            {
              name: "faithfulness",
              requiredInputFields: ["completion", "context", "question"],
            },
          ]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("faithfulness"),
            "error must name the evaluator",
          );
          assert.ok(
            err.message.includes("context") || err.message.includes("question"),
            "error must name the missing field",
          );
          assert.ok(err.message.includes("Hint:"), "error must include hint");
          return true;
        },
      );
    });

    it("succeeds when synonym covers the required field — no error thrown", () => {
      // 'answer' is a synonym of 'completion'; normalization maps it, so no error.
      assert.doesNotThrow(() =>
        validateAndNormalizeTaskOutput({ answer: "x" }, [
          { name: "ev", requiredInputFields: ["completion"] },
        ]),
      );
    });
  });

  describe("getFieldSuggestions", () => {
    it("returns synonym suggestions when a near field is available", () => {
      const suggestions = getFieldSuggestions("completion", ["answer", "foo"]);
      assert.ok(suggestions.includes("answer"));
    });

    it("returns empty array when no synonym match exists", () => {
      const suggestions = getFieldSuggestions("completion", [
        "completely_unrelated",
      ]);
      assert.deepStrictEqual(suggestions, []);
    });
  });

  describe("formatFieldHelp", () => {
    it("includes the field name and its synonyms", () => {
      const help = formatFieldHelp("completion");
      assert.ok(help.includes("completion"));
      assert.ok(help.includes("answer") || help.includes("synonyms"));
    });

    it("returns just the field name for unknown fields with no synonyms", () => {
      const help = formatFieldHelp("custom_field");
      assert.strictEqual(help, "'custom_field'");
    });
  });
});
