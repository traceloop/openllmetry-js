import * as assert from "assert";
import {
  defaultInputMapper,
  resolveGuardInputs,
} from "../../src/lib/guardrail/default-mapper";

describe("defaultInputMapper", () => {
  describe("string output", () => {
    it("maps to { text, prompt, completion } for one guard", () => {
      const result = defaultInputMapper("hello world", 1);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].text, "hello world");
      assert.strictEqual(result[0].prompt, "hello world");
      assert.strictEqual(result[0].completion, "hello world");
    });

    it("replicates the mapped input for multiple guards", () => {
      const result = defaultInputMapper("hello", 3);
      assert.strictEqual(result.length, 3);
      result.forEach((r) => {
        assert.strictEqual(r.text, "hello");
      });
    });
  });

  describe("object output", () => {
    it("preserves original keys", () => {
      const result = defaultInputMapper({ text: "my text" }, 1);
      assert.strictEqual(result[0].text, "my text");
    });

    it("adds synonym aliases for 'text'", () => {
      const result = defaultInputMapper({ text: "my text" }, 1);
      // text is synonymous with completion, answer, response
      assert.strictEqual(result[0].completion, "my text");
    });

    it("adds synonym aliases for 'question'", () => {
      const result = defaultInputMapper({ question: "what is AI?" }, 1);
      // question is synonymous with prompt, instructions, query
      assert.strictEqual(result[0].prompt, "what is AI?");
      assert.strictEqual(result[0].query, "what is AI?");
    });

    it("replicates for multiple guards", () => {
      const result = defaultInputMapper({ text: "hello" }, 2);
      assert.strictEqual(result.length, 2);
    });

    it("does not overwrite existing keys with synonyms", () => {
      const result = defaultInputMapper(
        { text: "text val", completion: "completion val" },
        1,
      );
      assert.strictEqual(result[0].text, "text val");
      assert.strictEqual(result[0].completion, "completion val");
    });
  });

  describe("unsupported output types", () => {
    it("throws for number input", () => {
      assert.throws(
        () => defaultInputMapper(42, 1),
        /Cannot automatically map output of type "number"/,
      );
    });

    it("throws for null input", () => {
      assert.throws(
        () => defaultInputMapper(null, 1),
        /Cannot automatically map output of type "object"/,
      );
    });

    it("throws for array input", () => {
      assert.throws(
        () => defaultInputMapper(["a", "b"], 1),
        /Cannot automatically map output/,
      );
    });
  });
});

describe("resolveGuardInputs", () => {
  const guardNames = ["toxicity-detector", "pii-detector"];

  it("uses default mapper when no inputMapper provided", () => {
    const result = resolveGuardInputs("hello", 2, guardNames, undefined);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].text, "hello");
  });

  it("uses custom inputMapper when provided (list form)", () => {
    const inputMapper = (text: unknown) => [
      { text: text as string },
      { prompt: text as string },
    ];
    const result = resolveGuardInputs(
      "hello",
      2,
      guardNames,
      inputMapper as any,
    );
    assert.strictEqual(result[0].text, "hello");
    assert.strictEqual(result[1].prompt, "hello");
    assert.strictEqual(result[1].text, undefined);
  });

  it("uses custom inputMapper when provided (dict form)", () => {
    const inputMapper = (text: unknown) => ({
      "toxicity-detector": { text: text as string },
      "pii-detector": { content: text as string },
    });
    const result = resolveGuardInputs(
      "hello",
      2,
      guardNames,
      inputMapper as any,
    );
    assert.strictEqual(result[0].text, "hello");
    assert.strictEqual(result[1].content, "hello");
  });

  it("throws when list form has wrong count", () => {
    const inputMapper = () => [{ text: "a" }]; // only 1 for 2 guards
    assert.throws(
      () => resolveGuardInputs("hello", 2, guardNames, inputMapper as any),
      /returned 1 inputs but there are 2 guards/,
    );
  });

  it("throws when dict form is missing a guard name", () => {
    const inputMapper = () => ({ "toxicity-detector": { text: "a" } }); // missing pii-detector
    assert.throws(
      () => resolveGuardInputs("hello", 2, guardNames, inputMapper as any),
      /no entry found for guard "pii-detector"/,
    );
  });
});
