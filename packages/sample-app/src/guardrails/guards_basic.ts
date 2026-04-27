/**
 * Guards Basic Examples
 * ======================
 * Demonstrates sequential failFast pipelines and onFailure shorthands.
 *
 * Examples:
 *   - sequential().failFast() — stop at first failure
 *   - onFailure shorthands — "log" and "ignore" modes
 *
 * Run:
 *   npm run build && node dist/src/guardrails/guards_basic.js
 *
 * Environment:
 *   TRACELOOP_API_KEY  — Traceloop key
 *   TRACELOOP_BASE_URL — https://api.traceloop.dev
 */

// ── Init — Traceloop FIRST ───────────────────────────────────────────────────
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "guardrails-guards-basic-examples",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
  silenceInitializationMessage: true,
});

import {
  Guardrails,
  toxicityGuard,
  piiGuard,
  jsonValidatorGuard,
  Guard,
  GuardValidationError,
} from "@traceloop/node-server-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

function ok(msg: string) {
  console.log(`  ✅  ${msg}`);
}
function fail(msg: string) {
  console.log(`  🚫  ${msg}`);
}
function info(msg: string) {
  console.log(`  ℹ️   ${msg}`);
}

// ── sequential().failFast() — stop at first failure ──────────────────────────

async function useCase7_sequentialFailFast(): Promise<void> {
  sep("sequential().failFast() — stop at first failure");

  // Run toxicity first, then PII. If toxicity fails, PII never runs.
  // Useful when guards are expensive — skip the rest once you know it failed.
  // We track which guards actually ran by wrapping them.
  const ranGuards: string[] = [];

  const trackingToxicity: Guard = async (input) => {
    ranGuards.push("toxicityGuard");
    return toxicityGuard()(input);
  };
  trackingToxicity.guardName = "toxicityGuard";

  const trackingPii: Guard = async (input) => {
    ranGuards.push("piiGuard");
    return piiGuard()(input);
  };
  trackingPii.guardName = "piiGuard";

  const g = new Guardrails({}, [trackingToxicity, trackingPii])
    .sequential()
    .failFast()
    .named("fail-fast-pipeline");

  // Use validate() with a pre-canned toxic string — no LLM call needed.
  // The point here is to demonstrate guard sequencing, not LLM output.
  info("Validating a toxic string through sequential fail-fast pipeline...");
  const results = await g.validate([
    {
      text: "I hate you. You are worthless garbage. People like you should not exist.",
      prompt:
        "I hate you. You are worthless garbage. People like you should not exist.",
      completion:
        "I hate you. You are worthless garbage. People like you should not exist.",
    },
    {
      text: "I hate you. You are worthless garbage. People like you should not exist.",
      prompt:
        "I hate you. You are worthless garbage. People like you should not exist.",
      completion:
        "I hate you. You are worthless garbage. People like you should not exist.",
    },
  ]);

  info(`Guards that ran: [${ranGuards.join(", ")}]`);
  info(
    `Results: ${results.map((r) => `${r.name}=${r.passed ? "pass" : "fail"}`).join(", ")}`,
  );
  if (ranGuards.includes("piiGuard")) {
    fail(`piiGuard ran — failFast did NOT work as expected ✗`);
  } else {
    fail(`toxicityGuard fired — piiGuard was skipped ✓`);
  }
}

// ── onFailure shorthands — "log" and "ignore" ─────────────────────────────────

async function useCase10_onFailureShorthands(): Promise<void> {
  sep('onFailure shorthands — "log" and "ignore"');

  // Using jsonValidatorGuard with pre-canned prose — no LLM needed.
  // Plain prose always fails JSON validation — predictable and instant.
  const PROSE = "This is plain English, not JSON.";

  // "log" — logs a warning via OTel diag and returns the original result
  const logGuard = new Guardrails(
    { name: "log-on-failure", onFailure: "log" },
    [jsonValidatorGuard()],
  );

  info(
    '"log" mode — prose input will fail JSON guard but result is still returned...',
  );
  const logResult = await logGuard.run(async () => PROSE);
  ok(`Guard failed but did NOT throw — "log" mode returned original result ✓`);
  info(`Result: "${logResult}"`);

  // "ignore" — silently returns the original result, no logging
  console.log();
  const ignoreGuard = new Guardrails(
    { name: "ignore-on-failure", onFailure: "ignore" },
    [jsonValidatorGuard()],
  );

  info('"ignore" mode — guard fails silently, original result returned...');
  const ignoreResult = await ignoreGuard.run(async () => PROSE);
  ok(`Guard failed silently — no exception, no log, result returned ✓`);
  info(`Result: "${ignoreResult}"`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  GUARDS BASIC EXAMPLES");
  console.log(
    `  Backend: ${process.env.TRACELOOP_BASE_URL ?? "https://api.traceloop.dev"}`,
  );
  console.log(`${"═".repeat(60)}\n`);

  await traceloop.withWorkflow(
    { name: "guards-basic-examples-workflow" },
    async () => {
      try {
        await useCase7_sequentialFailFast();
        await useCase10_onFailureShorthands();
      } catch (err) {
        if (err instanceof GuardValidationError) {
          console.error(
            "\n  ❌  GuardValidationError (unhandled):",
            err.message,
          );
        } else {
          console.error("\n  ❌  Unexpected error:", err);
        }
        await traceloop.forceFlush();
        process.exit(1);
      }
    },
  );

  console.log(`\n${"═".repeat(60)}`);
  console.log("  DONE");
  console.log(`${"═".repeat(60)}\n`);

  await traceloop.forceFlush();
}

main();
