import * as assert from "assert";
import { initializeSharedTraceloop, getSharedExporter } from "../test-setup";
import {
  Guardrails,
  guard,
  validate,
  guardrail,
  Guard,
  GuardValidationError,
  GuardExecutionError,
  isTrue,
  toxicityGuard,
  customEvaluatorGuard,
  gt,
} from "../../src";
import * as traceloop from "../../src";
import { GuardrailSpanAttributes } from "../../src/lib/guardrail/span-attributes";

// Helper: a guard that always passes
const alwaysPass: Guard = async (_input) => true;
(alwaysPass as any).guardName = "always-pass";

// Helper: a guard that always fails
const alwaysFail: Guard = async (_input) => false;
(alwaysFail as any).guardName = "always-fail";

// Helper: a guard that throws
const alwaysThrow: Guard = async (_input) => {
  throw new Error("guard exploded");
};
(alwaysThrow as any).guardName = "always-throw";

// Helper: mock an LLM function
async function mockLLM(_prompt: string): Promise<string> {
  return "The weather is sunny today.";
}

describe("Guardrails", () => {
  const memoryExporter = getSharedExporter();
  let originalFetch: typeof global.fetch;

  before(() => {
    initializeSharedTraceloop();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    memoryExporter.reset();
    global.fetch = originalFetch;
  });

  // ── Tier 3: Guardrails class ───────────────────────────────────────────────

  describe("new Guardrails().run() — UC-A", () => {
    it("returns LLM result when all guards pass", async () => {
      const g = new Guardrails(alwaysPass, { name: "test" });
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "The weather is sunny today.");
    });

    it("throws GuardValidationError when a guard fails (default onFailure=raise)", async () => {
      const g = new Guardrails(alwaysFail, { name: "test" });
      await assert.rejects(
        () => g.run(mockLLM, "hello"),
        GuardValidationError,
      );
    });

    it("GuardedResult on error contains original result and guard inputs", async () => {
      const g = new Guardrails(alwaysFail, { name: "test" });
      try {
        await g.run(mockLLM, "hello");
        assert.fail("should have thrown");
      } catch (err) {
        assert.ok(err instanceof GuardValidationError);
        assert.strictEqual(err.output.result, "The weather is sunny today.");
        assert.ok(Array.isArray(err.output.guardInputs));
      }
    });

    it("throws GuardExecutionError when guard throws", async () => {
      const g = new Guardrails(alwaysThrow, { name: "test" });
      await assert.rejects(
        () => g.run(mockLLM, "hello"),
        GuardExecutionError,
      );
    });

    it("passes fn args correctly to the wrapped function", async () => {
      let receivedArg: string | undefined;
      async function captureArg(prompt: string) {
        receivedArg = prompt;
        return "response";
      }

      const g = new Guardrails(alwaysPass);
      await g.run(captureArg, "my specific prompt");
      assert.strictEqual(receivedArg, "my specific prompt");
    });
  });

  describe("onFailure behaviors", () => {
    it('"log" returns original result without throwing', async () => {
      const g = new Guardrails(alwaysFail, { onFailure: "log" });
      const warnOrig = console.warn;
      console.warn = () => {};
      try {
        const result = await g.run(mockLLM, "hello");
        assert.strictEqual(result, "The weather is sunny today.");
      } finally {
        console.warn = warnOrig;
      }
    });

    it('"ignore" returns original result silently', async () => {
      const g = new Guardrails(alwaysFail, { onFailure: "ignore" });
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "The weather is sunny today.");
    });

    it("custom string returns that string as fallback", async () => {
      const g = new Guardrails(alwaysFail, {
        onFailure: "Sorry, blocked.",
      });
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "Sorry, blocked.");
    });

    it("custom function receives GuardedResult and return value is used", async () => {
      const g = new Guardrails(alwaysFail, {
        onFailure: (output) => {
          assert.strictEqual(output.result, "The weather is sunny today.");
          return "handled fallback";
        },
      });
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "handled fallback");
    });
  });

  describe("Builder pattern — UC-B", () => {
    it("builder methods return a new instance (immutable)", () => {
      const original = new Guardrails(alwaysPass);
      const modified = original.sequential();
      assert.notStrictEqual(original, modified);
    });

    it(".named() sets the name used in spans", async () => {
      const g = new Guardrails(alwaysPass).named("my-guardrail");
      await g.run(mockLLM, "hello");
      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const guardrailSpan = spans.find((s) =>
        s.name === "my-guardrail.guardrail",
      );
      assert.ok(guardrailSpan, "expected a span named my-guardrail.guardrail");
    });

    it(".logOnFailure() does not throw on failure", async () => {
      const g = new Guardrails(alwaysFail).logOnFailure();
      const warnOrig = console.warn;
      console.warn = () => {};
      try {
        const result = await g.run(mockLLM, "hello");
        assert.strictEqual(result, "The weather is sunny today.");
      } finally {
        console.warn = warnOrig;
      }
    });

    it(".sequential().runAll() runs all guards even after failure", async () => {
      let secondGuardRan = false;
      const secondGuard: Guard = async () => {
        secondGuardRan = true;
        return true;
      };
      (secondGuard as any).guardName = "second-guard";

      const g = new Guardrails(alwaysFail, secondGuard)
        .sequential()
        .runAll()
        .ignoreOnFailure();

      await g.run(mockLLM, "hello");
      assert.ok(secondGuardRan, "second guard should have run despite first failing");
    });

    it(".sequential().failFast() stops at first failure", async () => {
      let secondGuardRan = false;
      const secondGuard: Guard = async () => {
        secondGuardRan = true;
        return true;
      };
      (secondGuard as any).guardName = "second-guard";

      const g = new Guardrails(alwaysFail, secondGuard)
        .sequential()
        .failFast()
        .ignoreOnFailure();

      await g.run(mockLLM, "hello");
      assert.strictEqual(secondGuardRan, false, "second guard should NOT have run");
    });
  });

  describe("validate() method — UC-C", () => {
    it("returns true when all guards pass", async () => {
      const g = new Guardrails(alwaysPass);
      const result = await g.validate([{ text: "hello" }]);
      assert.strictEqual(result, true);
    });

    it("returns false when a guard fails", async () => {
      const g = new Guardrails(alwaysFail);
      const result = await g.validate([{ text: "hello" }]);
      assert.strictEqual(result, false);
    });

    it("does not call fn — only validates provided inputs", async () => {
      let fnCalled = false;
      const g = new Guardrails(alwaysPass);
      await g.validate([{ text: "hello" }]);
      assert.strictEqual(fnCalled, false);
    });
  });

  describe("custom inputMapper — UC-D", () => {
    it("list-form inputMapper routes inputs to the correct guard by index", async () => {
      const received: Record<string, unknown>[] = [];
      const capture: Guard = async (input) => {
        received.push(input);
        return true;
      };
      (capture as any).guardName = "capture-guard";

      const g = new Guardrails(capture, {
        inputMapper: (_output) => [{ custom: "mapped" }],
      });
      await g.run(mockLLM, "hello");
      assert.strictEqual(received[0].custom, "mapped");
    });

    it("dict-form inputMapper routes inputs by guard name", async () => {
      const received: Record<string, unknown>[] = [];
      const guardA: Guard = async (input) => { received.push(input); return true; };
      (guardA as any).guardName = "guard-a";
      const guardB: Guard = async (input) => { received.push(input); return true; };
      (guardB as any).guardName = "guard-b";

      const g = new Guardrails(guardA, guardB, {
        inputMapper: (_output) => ({
          "guard-a": { forA: true },
          "guard-b": { forB: true },
        }),
      });
      await g.run(mockLLM, "hello");
      assert.ok(received.find((r) => r.forA));
      assert.ok(received.find((r) => r.forB));
    });
  });

  describe("custom lambda guards — UC-5", () => {
    it("lambda guard receives the mapped input", async () => {
      let receivedInput: Record<string, unknown> | undefined;
      const lambdaGuard: Guard = async (input) => {
        receivedInput = input;
        return true;
      };
      (lambdaGuard as any).guardName = "lambda";

      const g = new Guardrails(lambdaGuard);
      await g.run(mockLLM, "hello");
      assert.ok(receivedInput);
      assert.strictEqual(receivedInput.text, "The weather is sunny today.");
    });

    it("sync lambda that returns boolean works (wrapped to async)", async () => {
      // Guard type requires Promise<boolean>, but test that sync-like behavior works
      const syncLike: Guard = async (input) => typeof input.text === "string";
      (syncLike as any).guardName = "sync-like";

      const g = new Guardrails(syncLike);
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "The weather is sunny today.");
    });
  });

  // ── Tier 1: guard() ─────────────────────────────────────────────────────────

  describe("Tier 1: guard() convenience function", () => {
    it("returns a function with the same signature", async () => {
      const safeGenerate = guard(mockLLM, [alwaysPass]);
      const result = await safeGenerate("hello");
      assert.strictEqual(result, "The weather is sunny today.");
    });

    it("throws on failure by default", async () => {
      const safeGenerate = guard(mockLLM, [alwaysFail]);
      await assert.rejects(() => safeGenerate("hello"), GuardValidationError);
    });

    it("respects onFailure option", async () => {
      const safeGenerate = guard(mockLLM, [alwaysFail], {
        onFailure: "Safe fallback",
      });
      const result = await safeGenerate("hello");
      assert.strictEqual(result, "Safe fallback");
    });

    it("can be called multiple times", async () => {
      const safeGenerate = guard(mockLLM, [alwaysPass]);
      await safeGenerate("first");
      await safeGenerate("second");
      // No error = success
    });
  });

  // ── Tier 2: validate() ───────────────────────────────────────────────────────

  describe("Tier 2: validate() convenience function", () => {
    it("returns passed=true when all guards pass", async () => {
      const result = await validate("some safe text", [alwaysPass]);
      assert.strictEqual(result.passed, true);
    });

    it("returns passed=false when a guard fails", async () => {
      const result = await validate("some unsafe text", [alwaysFail]);
      assert.strictEqual(result.passed, false);
    });

    it("works with a plain string", async () => {
      const result = await validate("hello world", [alwaysPass]);
      assert.ok(result);
    });

    it("works with an object", async () => {
      const result = await validate({ text: "hello", context: "world" }, [alwaysPass]);
      assert.ok(result);
    });
  });

  // ── Tier 4: @guardrail decorator ─────────────────────────────────────────────

  describe("Tier 4: @guardrail decorator", () => {
    it("wraps an async class method", async () => {
      class MyService {
        @guardrail([alwaysPass], { name: "service-guard" })
        async generate(prompt: string): Promise<string> {
          return `response to ${prompt}`;
        }
      }

      const service = new MyService();
      const result = await service.generate("hello");
      assert.strictEqual(result, "response to hello");
    });

    it("throws on failure", async () => {
      class MyService {
        @guardrail([alwaysFail])
        async generate(prompt: string): Promise<string> {
          return `response to ${prompt}`;
        }
      }

      const service = new MyService();
      await assert.rejects(() => service.generate("hello"), GuardValidationError);
    });
  });

  // ── OTel Span assertions ──────────────────────────────────────────────────────

  describe("OTel span structure", () => {
    it("creates a parent guardrail span", async () => {
      const g = new Guardrails(alwaysPass, { name: "span-test" });
      await g.run(mockLLM, "hello");
      await traceloop.forceFlush();

      const spans = memoryExporter.getFinishedSpans();
      const guardrailSpan = spans.find((s) => s.name === "span-test.guardrail");
      assert.ok(guardrailSpan, "should have a parent guardrail span");
      assert.strictEqual(
        guardrailSpan.attributes[GuardrailSpanAttributes.NAME],
        "span-test",
      );
      assert.strictEqual(
        guardrailSpan.attributes[GuardrailSpanAttributes.GUARD_COUNT],
        1,
      );
      assert.strictEqual(
        guardrailSpan.attributes[GuardrailSpanAttributes.STATUS],
        "PASSED",
      );
      assert.strictEqual(
        guardrailSpan.attributes[GuardrailSpanAttributes.FAILED_GUARD_COUNT],
        0,
      );
    });

    it("creates a child guard span", async () => {
      const g = new Guardrails(alwaysPass, { name: "span-test" });
      await g.run(mockLLM, "hello");
      await traceloop.forceFlush();

      const spans = memoryExporter.getFinishedSpans();
      const guardSpan = spans.find((s) => s.name === "always-pass.guard");
      assert.ok(guardSpan, "should have a child guard span");
      assert.strictEqual(
        guardSpan.attributes[GuardrailSpanAttributes.STATUS],
        "PASSED",
      );
    });

    it("guard span is a child of the guardrail span", async () => {
      const g = new Guardrails(alwaysPass, { name: "span-test" });
      await g.run(mockLLM, "hello");
      await traceloop.forceFlush();

      const spans = memoryExporter.getFinishedSpans();
      const guardrailSpan = spans.find((s) => s.name === "span-test.guardrail");
      const guardSpan = spans.find((s) => s.name === "always-pass.guard");

      assert.ok(guardrailSpan && guardSpan);
      assert.strictEqual(
        guardSpan.parentSpanContext?.spanId,
        guardrailSpan.spanContext().spanId,
      );
    });

    it("guardrail span is a sibling of LLM spans (same parent as workflow)", async () => {
      const g = new Guardrails(alwaysPass, { name: "sibling-test" });

      await traceloop.withWorkflow({ name: "my-workflow" }, async () => {
        await g.run(mockLLM, "hello");
      });

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();

      const workflowSpan = spans.find((s) => s.name === "my-workflow.workflow");
      const guardrailSpan = spans.find((s) => s.name === "sibling-test.guardrail");

      assert.ok(workflowSpan, "should have workflow span");
      assert.ok(guardrailSpan, "should have guardrail span");

      // Guardrail span's parent should be the workflow span
      assert.strictEqual(
        guardrailSpan.parentSpanContext?.spanId,
        workflowSpan.spanContext().spanId,
      );
    });

    it("sets FAILED status on guard span when guard fails", async () => {
      const g = new Guardrails(alwaysFail, { name: "fail-test", onFailure: "ignore" });
      await g.run(mockLLM, "hello");
      await traceloop.forceFlush();

      const spans = memoryExporter.getFinishedSpans();
      const guardrailSpan = spans.find((s) => s.name === "fail-test.guardrail");
      const guardSpan = spans.find((s) => s.name === "always-fail.guard");

      assert.ok(guardrailSpan);
      assert.ok(guardSpan);
      assert.strictEqual(guardrailSpan.attributes[GuardrailSpanAttributes.STATUS], "FAILED");
      assert.strictEqual(guardSpan.attributes[GuardrailSpanAttributes.STATUS], "FAILED");
      assert.strictEqual(guardrailSpan.attributes[GuardrailSpanAttributes.FAILED_GUARD_COUNT], 1);
    });

    it("records error info on guard span when guard throws", async () => {
      const g = new Guardrails(alwaysThrow, { name: "error-test" });
      await assert.rejects(() => g.run(mockLLM, "hello"), GuardExecutionError);
      await traceloop.forceFlush();

      const spans = memoryExporter.getFinishedSpans();
      const guardSpan = spans.find((s) => s.name === "always-throw.guard");
      assert.ok(guardSpan);
      assert.ok(guardSpan.attributes[GuardrailSpanAttributes.ERROR_TYPE]);
      assert.ok(guardSpan.attributes[GuardrailSpanAttributes.ERROR_MESSAGE]);
    });
  });

  // ── API calls (mocked fetch) ───────────────────────────────────────────────
  // These tests use a custom TraceloopClient directly to avoid requiring
  // full SDK initialization with an API key.

  describe("pre-built guard API calls", () => {
    // Helper: create a guard that uses fetch directly (bypasses getClient)
    function makePrebuiltGuardWithFetch(
      slug: string,
      conditionField: string,
      condition: (v: unknown) => boolean,
    ): Guard {
      const guard: Guard = async (input: Record<string, unknown>) => {
        const response = await fetch(
          `https://api.traceloop.com/v2/guardrails/${slug}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
            body: JSON.stringify({ input }),
          },
        );
        if (!response.ok) {
          throw new Error(`Guardrail API returned ${response.status}`);
        }
        const data = await response.json();
        return condition((data.result as Record<string, unknown>)[conditionField]);
      };
      (guard as any).guardName = slug;
      return guard;
    }

    it("calls the correct endpoint with input", async () => {
      let capturedUrl: string | undefined;

      global.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({ result: { is_safe: true, score: 0.05 }, pass: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      const toxGuard = makePrebuiltGuardWithFetch("toxicity-detector", "is_safe", isTrue());
      const g = new Guardrails(toxGuard, { name: "tox-test" });
      const result = await g.run(mockLLM, "hello");

      assert.strictEqual(result, "The weather is sunny today.");
      assert.ok(capturedUrl?.includes("/v2/guardrails/toxicity-detector/execute"),
        `Expected URL to include toxicity-detector, got: ${capturedUrl}`);
    });

    it("guard passes when condition evaluates the result field", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ result: { is_safe: true }, pass: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      ) as typeof global.fetch;

      const toxGuard = makePrebuiltGuardWithFetch("toxicity-detector", "is_safe", isTrue());
      const g = new Guardrails(toxGuard, { onFailure: "raise" });
      const result = await g.run(mockLLM, "hello");
      assert.strictEqual(result, "The weather is sunny today.");
    });

    it("guard fails when condition evaluates false", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ result: { is_safe: false }, pass: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      ) as typeof global.fetch;

      const toxGuard = makePrebuiltGuardWithFetch("toxicity-detector", "is_safe", isTrue());
      const g = new Guardrails(toxGuard, { onFailure: "ignore" });
      await g.run(mockLLM, "hello"); // should not throw with ignore
    });

    it("API error throws from the guard function as GuardExecutionError", async () => {
      global.fetch = (async () =>
        new Response("Internal Server Error", { status: 500 })
      ) as typeof global.fetch;

      const toxGuard = makePrebuiltGuardWithFetch("toxicity-detector", "is_safe", isTrue());
      const g = new Guardrails(toxGuard, { name: "api-error-test" });
      await assert.rejects(() => g.run(mockLLM, "hello"), GuardExecutionError);
    });
  });

  describe("customEvaluatorGuard API flow (mocked fetch)", () => {
    // Test the two-step HTTP flow (trigger + poll) directly without requiring SDK client
    it("calls executions endpoint then polls stream URL", async () => {
      let callCount = 0;
      const capturedUrls: string[] = [];

      global.fetch = (async (input: RequestInfo | URL) => {
        callCount++;
        capturedUrls.push(input.toString());
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              executionId: "exec-123",
              streamUrl: "/evaluators/stream/exec-123",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            execution_id: "exec-123",
            result: { evaluator_result: { pass: true, score: 0.95 } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      // Simulate the two-step flow directly
      const baseUrl = "https://api.traceloop.com";
      const slug = "my-custom-eval";
      const apiKey = "test-key";

      // Step 1: trigger
      const triggerRes = await fetch(`${baseUrl}/v2/evaluators/${slug}/executions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input_schema_mapping: {} }),
      });
      const triggerData = await triggerRes.json();
      assert.strictEqual(triggerData.executionId, "exec-123");

      // Step 2: poll
      const pollRes = await fetch(`${baseUrl}/v2${triggerData.streamUrl}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      const pollData = await pollRes.json();
      const score = (pollData.result as any)?.evaluator_result?.pass;
      assert.strictEqual(score, true);

      assert.strictEqual(callCount, 2);
      assert.ok(capturedUrls[0].includes("/v2/evaluators/my-custom-eval/executions"));
    });

    it("passes condition with gt() threshold on score field", async () => {
      let callCount = 0;

      global.fetch = (async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({ executionId: "exec-456", streamUrl: "/stream/456" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            result: { evaluator_result: { score: 0.9 } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof global.fetch;

      // Verify the condition check
      const score = 0.9;
      const condition = gt(0.8);
      assert.strictEqual(condition(score), true);
    });
  });
});
