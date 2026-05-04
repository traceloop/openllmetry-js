import * as assert from "assert";
import {
  isTrue,
  isFalse,
  isTruthy,
  isFalsy,
  gt,
  lt,
  gte,
  lte,
  between,
  eq,
} from "../../src/lib/guardrail/conditions";

describe("conditions", () => {
  describe("isTrue()", () => {
    const check = isTrue();

    it("returns true for boolean true", () =>
      assert.strictEqual(check(true), true));
    it("returns false for boolean false", () =>
      assert.strictEqual(check(false), false));
    it("returns false for string 'true'", () =>
      assert.strictEqual(check("true"), false));
    it("returns false for number 1", () => assert.strictEqual(check(1), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
    it("returns false for undefined", () =>
      assert.strictEqual(check(undefined), false));
  });

  describe("isFalse()", () => {
    const check = isFalse();

    it("returns true for boolean false", () =>
      assert.strictEqual(check(false), true));
    it("returns false for boolean true", () =>
      assert.strictEqual(check(true), false));
    it("returns false for string 'false'", () =>
      assert.strictEqual(check("false"), false));
    it("returns false for number 0", () => assert.strictEqual(check(0), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
  });

  describe("isTruthy()", () => {
    const check = isTruthy();

    it("returns true for true", () => assert.strictEqual(check(true), true));
    it("returns true for non-empty string", () =>
      assert.strictEqual(check("hello"), true));
    it("returns true for non-zero number", () =>
      assert.strictEqual(check(1), true));
    it("returns false for false", () =>
      assert.strictEqual(check(false), false));
    it("returns false for empty string", () =>
      assert.strictEqual(check(""), false));
    it("returns false for 0", () => assert.strictEqual(check(0), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
    it("returns false for undefined", () =>
      assert.strictEqual(check(undefined), false));
  });

  describe("isFalsy()", () => {
    const check = isFalsy();

    it("returns true for false", () => assert.strictEqual(check(false), true));
    it("returns true for 0", () => assert.strictEqual(check(0), true));
    it("returns true for empty string", () =>
      assert.strictEqual(check(""), true));
    it("returns true for null", () => assert.strictEqual(check(null), true));
    it("returns true for undefined", () =>
      assert.strictEqual(check(undefined), true));
    it("returns false for true", () => assert.strictEqual(check(true), false));
    it("returns false for 1", () => assert.strictEqual(check(1), false));
  });

  describe("gt()", () => {
    const check = gt(5);

    it("returns true when value > threshold", () =>
      assert.strictEqual(check(6), true));
    it("returns false when value === threshold", () =>
      assert.strictEqual(check(5), false));
    it("returns false when value < threshold", () =>
      assert.strictEqual(check(4), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
    it("returns false for undefined", () =>
      assert.strictEqual(check(undefined), false));
    it("returns false for NaN", () => assert.strictEqual(check(NaN), false));
    it("works with decimal threshold", () =>
      assert.strictEqual(gt(0.8)(0.9), true));
  });

  describe("lt()", () => {
    const check = lt(5);

    it("returns true when value < threshold", () =>
      assert.strictEqual(check(4), true));
    it("returns false when value === threshold", () =>
      assert.strictEqual(check(5), false));
    it("returns false when value > threshold", () =>
      assert.strictEqual(check(6), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
    it("returns false for NaN", () => assert.strictEqual(check(NaN), false));
  });

  describe("gte()", () => {
    const check = gte(5);

    it("returns true when value >= threshold", () =>
      assert.strictEqual(check(5), true));
    it("returns true when value > threshold", () =>
      assert.strictEqual(check(6), true));
    it("returns false when value < threshold", () =>
      assert.strictEqual(check(4), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
  });

  describe("lte()", () => {
    const check = lte(5);

    it("returns true when value <= threshold", () =>
      assert.strictEqual(check(5), true));
    it("returns true when value < threshold", () =>
      assert.strictEqual(check(4), true));
    it("returns false when value > threshold", () =>
      assert.strictEqual(check(6), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
  });

  describe("between()", () => {
    const check = between(2, 8);

    it("returns true at lower bound", () => assert.strictEqual(check(2), true));
    it("returns true at upper bound", () => assert.strictEqual(check(8), true));
    it("returns true in middle", () => assert.strictEqual(check(5), true));
    it("returns false below lower bound", () =>
      assert.strictEqual(check(1), false));
    it("returns false above upper bound", () =>
      assert.strictEqual(check(9), false));
    it("returns false for null", () => assert.strictEqual(check(null), false));
    it("returns false for NaN", () => assert.strictEqual(check(NaN), false));
    it("works for single-value range", () =>
      assert.strictEqual(between(1, 1)(1), true));
  });

  describe("eq()", () => {
    it("passes for string equality", () =>
      assert.strictEqual(eq("hello")("hello"), true));
    it("fails for string inequality", () =>
      assert.strictEqual(eq("hello")("world"), false));
    it("passes for number equality", () =>
      assert.strictEqual(eq(42)(42), true));
    it("passes for boolean equality", () =>
      assert.strictEqual(eq(true)(true), true));
    it("passes for null", () => assert.strictEqual(eq(null)(null), true));
    it("fails for null vs undefined", () =>
      assert.strictEqual(eq(null)(undefined), false));
    it("uses strict equality", () => assert.strictEqual(eq(0)("0"), false));
  });
});
