/**
 * Guard Error Handling Example
 * =============================
 * Demonstrates that real guard errors (network timeout, HTTP failure, code bug)
 * propagate as GuardExecutionError — they are NOT silently treated as logical
 * failures. This matches Python SDK behavior.
 *
 * Each example verifies:
 *   - GuardExecutionError is thrown to the caller
 *   - The guard span gets ERROR OTel status + error.type/error.message attributes
 *   - The parent guardrail span gets ERROR status with NO aggregated attrs
 *
 * Check the Traceloop UI after running — look for spans with red ERROR status.
 *
 * Run:
 *   npm run build && node dist/src/guardrails/error_handling.js
 *
 * Environment:
 *   TRACELOOP_API_KEY  — your Traceloop API key
 *   TRACELOOP_BASE_URL — https://api.traceloop.dev
 */

// ── Init — Traceloop FIRST ───────────────────────────────────────────────────
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "guardrails-error-handling-example",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
  silenceInitializationMessage: true,
});

import {
  Guardrails,
  validate,
  GuardExecutionError,
} from "@traceloop/node-server-sdk";
import type { Guard } from "@traceloop/node-server-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// A guard that always throws a real error (simulates timeout / network failure)
function makeErrorGuard(message: string): Guard {
  const g: Guard = async (_input) => {
    throw new Error(message);
  };
  g.guardName = "error-guard";
  return g;
}

// A guard that always passes — used alongside error guards in multi-guard cases
const alwaysPass: Guard = Object.assign(
  async (_input: Record<string, unknown>) => true,
  { guardName: "always-pass" },
);

// ── Example 1: validate() propagates GuardExecutionError ─────────────────────

async function example1_validateThrows(): Promise<void> {
  sep("EXAMPLE 1 — validate() throws GuardExecutionError on real error");

  console.log(
    "  Running validate() with a guard that throws a network error...",
  );

  try {
    await validate("some LLM output", [
      makeErrorGuard("Simulated network timeout"),
    ]);
    console.log("  ❌ ERROR: validate() should have thrown but didn't");
  } catch (err) {
    if (err instanceof GuardExecutionError) {
      console.log("  ✅ GuardExecutionError thrown as expected");
      console.log(`     .message:           "${err.message}"`);
      console.log(
        `     .originalException: "${err.originalException.message}"`,
      );
      console.log(`     .guardIndex:        ${err.guardIndex}`);
      console.log(
        "  ℹ️  Check Traceloop UI: error-guard.guard span → ERROR status,",
      );
      console.log("      gen_ai.guardrail.error.type = Error,");
      console.log(
        "      gen_ai.guardrail.error.message = Simulated network timeout",
      );
    } else {
      console.log("  ❌ Wrong error type thrown:", err);
    }
  }
}

// ── Example 2: run() propagates GuardExecutionError ──────────────────────────

async function example2_runThrows(): Promise<void> {
  sep("EXAMPLE 2 — run() throws GuardExecutionError on real error");

  console.log(
    "  Running Guardrails.run() with a guard that throws an HTTP error...",
  );

  const g = new Guardrails({ name: "http-error-test", onFailure: "log" }, [
    makeErrorGuard("HTTP 503: Service Unavailable"),
  ]);

  try {
    await g.run(async () => "LLM response text");
    console.log("  ❌ ERROR: run() should have thrown but didn't");
  } catch (err) {
    if (err instanceof GuardExecutionError) {
      console.log(
        "  ✅ GuardExecutionError thrown — onFailure='log' was NOT called",
      );
      console.log(`     .message:           "${err.message}"`);
      console.log(
        `     .originalException: "${err.originalException.message}"`,
      );
      console.log(
        "  ℹ️  Check Traceloop UI: http-error-test.guardrail span → ERROR status,",
      );
      console.log(
        "      NO gen_ai.guardrail.status / duration / failed_guard_count (short-circuited)",
      );
    } else {
      console.log("  ❌ Wrong error type thrown:", err);
    }
  }
}

// ── Example 3: parallel().runAll() — one guard errors, one passes ─────────────

async function example3_parallelRunAllThrows(): Promise<void> {
  sep(
    "EXAMPLE 3 — parallel().runAll() propagates error even when another guard passes",
  );

  console.log(
    "  Running 2 guards in parallel (runAll): alwaysPass + errorGuard...",
  );

  const g = new Guardrails({ name: "parallel-error-test" }, [
    alwaysPass,
    makeErrorGuard("Evaluator API returned 500"),
  ])
    .parallel()
    .runAll();

  try {
    await g.run(async () => "LLM response text");
    console.log("  ❌ ERROR: run() should have thrown but didn't");
  } catch (err) {
    if (err instanceof GuardExecutionError) {
      console.log(
        "  ✅ GuardExecutionError propagated from parallel().runAll()",
      );
      console.log(`     .message:           "${err.message}"`);
      console.log(
        `     .originalException: "${err.originalException.message}"`,
      );
      console.log(`     .guardIndex:        ${err.guardIndex}`);
      console.log(
        "  ℹ️  Check Traceloop UI: parallel-error-test.guardrail → ERROR,",
      );
      console.log(
        "      always-pass.guard → PASSED (completed before error re-throw),",
      );
      console.log("      error-guard.guard → ERROR with full exception event");
    } else {
      console.log("  ❌ Wrong error type thrown:", err);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  GUARDRAILS ERROR HANDLING EXAMPLE");
  console.log(
    `  Backend: ${process.env.TRACELOOP_BASE_URL ?? "https://api.traceloop.dev"}`,
  );
  console.log(`${"═".repeat(60)}`);
  console.log(
    "\n  Real guard errors throw GuardExecutionError — never silently",
  );
  console.log("  treated as logical failures. Check spans for ERROR status.\n");

  await traceloop.withWorkflow(
    { name: "guardrails-error-handling-workflow" },
    async () => {
      await example1_validateThrows();
      await example2_runThrows();
      await example3_parallelRunAllThrows();
    },
  );

  console.log(`\n${"═".repeat(60)}`);
  console.log("  ALL EXAMPLES COMPLETE");
  console.log(`${"═".repeat(60)}\n`);

  await traceloop.forceFlush();
}

main();
