import * as assert from "assert";
import {
  OnFailure,
  resolveOnFailure,
} from "../../src/lib/guardrail/on-failure";
import { GuardValidationError } from "../../src/lib/guardrail/model";

const dummyGuardedResult = {
  result: "some response",
  guardInputs: [{ text: "some response" }],
};

describe("OnFailure", () => {
  describe("raiseException()", () => {
    it("throws a GuardValidationError", () => {
      const handler = OnFailure.raiseException();
      assert.throws(
        () => handler(dummyGuardedResult),
        (err: unknown) => {
          assert.ok(err instanceof GuardValidationError);
          return true;
        },
      );
    });

    it("includes the GuardedResult on the error", () => {
      const handler = OnFailure.raiseException();
      try {
        handler(dummyGuardedResult);
        assert.fail("should have thrown");
      } catch (err) {
        assert.ok(err instanceof GuardValidationError);
        assert.strictEqual(err.output.result, "some response");
      }
    });

    it("uses a custom message when provided", () => {
      const handler = OnFailure.raiseException("Custom error message");
      assert.throws(
        () => handler(dummyGuardedResult),
        (err: unknown) => {
          assert.ok(err instanceof GuardValidationError);
          assert.ok((err as Error).message.includes("Custom error message"));
          return true;
        },
      );
    });
  });

  describe("log()", () => {
    it("returns the original result", () => {
      const handler = OnFailure.log();
      // diag is silent by default in tests (no logger registered) — no suppression needed
      const result = handler(dummyGuardedResult);
      assert.strictEqual(result, "some response");
    });
  });

  describe("noop()", () => {
    it("returns the original result silently", () => {
      const handler = OnFailure.noop();
      const result = handler(dummyGuardedResult);
      assert.strictEqual(result, "some response");
    });
  });

  describe("returnValue()", () => {
    it("returns the provided fallback value", () => {
      const handler = OnFailure.returnValue("Sorry, I cannot help with that.");
      const result = handler(dummyGuardedResult);
      assert.strictEqual(result, "Sorry, I cannot help with that.");
    });

    it("can return any type", () => {
      const handler = OnFailure.returnValue({ fallback: true });
      const result = handler(dummyGuardedResult);
      assert.deepStrictEqual(result, { fallback: true });
    });

    it("can return null", () => {
      const handler = OnFailure.returnValue(null);
      const result = handler(dummyGuardedResult);
      assert.strictEqual(result, null);
    });
  });
});

describe("resolveOnFailure()", () => {
  it('"raise" resolves to a function that throws GuardValidationError', () => {
    const handler = resolveOnFailure("raise");
    assert.throws(() => handler(dummyGuardedResult), GuardValidationError);
  });

  it('"log" resolves to a function that returns original result', () => {
    const handler = resolveOnFailure("log");
    // diag is silent by default in tests — no console suppression needed
    const result = handler(dummyGuardedResult);
    assert.strictEqual(result, "some response");
  });

  it('"ignore" resolves to noop', () => {
    const handler = resolveOnFailure("ignore");
    const result = handler(dummyGuardedResult);
    assert.strictEqual(result, "some response");
  });

  it('"noop" resolves to noop', () => {
    const handler = resolveOnFailure("noop");
    const result = handler(dummyGuardedResult);
    assert.strictEqual(result, "some response");
  });

  it("any other string resolves to returnValue with that string", () => {
    const handler = resolveOnFailure("Sorry, blocked.");
    const result = handler(dummyGuardedResult);
    assert.strictEqual(result, "Sorry, blocked.");
  });

  it("a callable is returned as-is", () => {
    const myHandler = () => "custom";
    const resolved = resolveOnFailure(myHandler);
    assert.strictEqual(resolved, myHandler);
  });
});
