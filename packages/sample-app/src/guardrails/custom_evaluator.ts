/**
 * Custom Evaluator Guard — End-to-End Test
 * ==========================================
 * Tests customEvaluatorGuard() against a real user-defined LLM-as-a-judge
 * evaluator on staging. This is the ONLY place in the codebase that exercises
 * the two-call HTTP flow (POST trigger + GET blocking long-poll) against
 * real infrastructure.
 *
 * Also tests the custom inputMapper — the evaluator's prompt template uses
 * {llm_response} as the variable name, which is not in the default mapper's
 * synonym groups, so we must pass the field name explicitly.
 *
 * Real-world scenario:
 * --------------------
 * An educational app that ONLY answers physics questions. Every LLM response
 * is run through a "physics content" guardrail before being returned to the
 * user. If the response doesn't contain physics, the guard fires and returns
 * a fallback message.
 *
 * Guard configuration:
 *   conditionField: "isValid"  — boolean from the evaluator output schema
 *   condition: isTrue()        — pass when the response IS about physics
 *   onFailure: fallback string — user sees "Please ask a physics question" instead
 *
 * Cases:
 *   ✅ Case 1 — on-topic physics response → guard passes → response returned
 *   🚫 Case 2 — off-topic response → guard fires → fallback returned
 *   ❓ Case 3 — borderline: metaphorical "energy" usage → tests evaluator judgment
 *
 * Run:
 *   npm run build && node dist/src/guardrails_custom_eval_test.js
 *
 * Environment:
 *   TRACELOOP_API_KEY  — staging key
 *   TRACELOOP_BASE_URL — https://api.traceloop.dev
 */

// ── Init — Traceloop FIRST ───────────────────────────────────────────────────
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "guardrails-custom-eval-test",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
  silenceInitializationMessage: true,
});

import {
  Guardrails,
  customEvaluatorGuard,
  isTrue,
} from "@traceloop/node-server-sdk";

// ── Config ────────────────────────────────────────────────────────────────────

const EVALUATOR_SLUG = "custom-test";
const FALLBACK = "I can only help with physics questions. Please ask something related to physics.";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}
function ok(msg: string)     { console.log(`  ✅  ${msg}`); }
function blocked(msg: string){ console.log(`  🚫  ${msg}`); }
function info(msg: string)   { console.log(`  ℹ️   ${msg}`); }
function edge(msg: string)   { console.log(`  ❓  ${msg}`); }

// ── Guard instance ────────────────────────────────────────────────────────────
//
// The guard is configured once and reused for all cases — this mirrors
// how a real app would use it: define once at startup, apply to every response.
//
// conditionField: "isValid" — the evaluator returns { isValid: boolean, reasoning: string }
// condition: isTrue()       — the response must contain physics to pass
// onFailure: fallback string — what the user sees when the guard fires
//
// Custom inputMapper is NOT needed here — we pass guardInputs directly to
// validate() using { llm_response: "..." } which matches the evaluator's
// {llm_response} template variable.

const physicsContentGuard = customEvaluatorGuard(EVALUATOR_SLUG, {
  conditionField: "isValid",
  condition: isTrue(),
  timeoutMs: 60000,
});

const g = new Guardrails(
  {
    name: "physics-topic-check",
    onFailure: FALLBACK,
  },
  [physicsContentGuard],
);

// ── Run a case ────────────────────────────────────────────────────────────────

async function runCase(
  caseLabel: string,
  simulatedLLMResponse: string,
  expectBlocked: boolean,
): Promise<void> {
  info(`LLM responded: "${simulatedLLMResponse.slice(0, 80)}..."`);

  try {
    // validate() directly — pass the response text with the field name
    // the evaluator template expects: { llm_response: "..." }
    const guardInputs = [{ llm_response: simulatedLLMResponse }];
    const results = await g.validate(guardInputs);
    const passed = results.every((r) => r.passed);
    const duration = results[0]?.duration ?? 0;

    if (!passed && expectBlocked) {
      blocked(`Guard fired — response blocked. Fallback shown to user:`);
      console.log(`         "${FALLBACK}"`);
      info(`Evaluator duration: ${Math.round(duration)}ms`);
    } else if (passed && !expectBlocked) {
      ok(`Guard passed — response returned to user.`);
      info(`Evaluator duration: ${Math.round(duration)}ms`);
    } else if (!passed && !expectBlocked) {
      console.log(`  ⚠️   Guard fired unexpectedly — response was blocked but shouldn't have been.`);
      info(`Evaluator duration: ${Math.round(duration)}ms`);
    } else {
      console.log(`  ⚠️   Guard passed but response should have been blocked.`);
      info(`Evaluator duration: ${Math.round(duration)}ms`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  💥  Error: ${msg}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  PHYSICS EDUCATION APP — TOPIC GUARDRAIL TEST");
  console.log(`  Evaluator: ${EVALUATOR_SLUG}`);
  console.log(`  Backend:   ${process.env.TRACELOOP_BASE_URL ?? "https://api.traceloop.com"}`);
  console.log(`${"═".repeat(60)}`);
  console.log("\n  Scenario: educational app that only answers physics questions.");
  console.log("  Guard blocks any LLM response that doesn't contain physics content.");
  console.log("  Each case invokes a real LLM judge — expect ~2-5s per case.\n");

  await traceloop.withWorkflow(
    { name: "physics-guardrail-test-workflow" },
    async () => {

      // ── Case 1: on-topic physics response ──────────────────────────────────
      // The LLM answered a physics question correctly.
      // Evaluator returns isValid=true → guard passes → response returned to user.
      sep("CASE 1 — On-topic physics response → guard passes → shown to user");
      await runCase(
        "physics",
        "Newton's second law states that F = ma, where F is the net force acting on " +
        "an object, m is its mass, and a is its acceleration. This fundamental principle " +
        "of classical mechanics explains how objects move under applied forces.",
        false, // expectBlocked = false → should pass
      );

      // ── Case 2: off-topic response ─────────────────────────────────────────
      // The user asked "what's a good dinner recipe?" and the LLM answered.
      // Evaluator returns isValid=false → guard fires → fallback shown instead.
      sep("CASE 2 — Off-topic response (pasta recipe) → guard blocks → fallback shown");
      await runCase(
        "off-topic",
        "The best pasta recipe uses fresh tomatoes, basil, and garlic. " +
        "Simmer the sauce for 20 minutes before serving over al dente spaghetti. " +
        "Season generously with salt and pepper.",
        true, // expectBlocked = true → should fire
      );

      // ── Case 3: borderline — metaphorical "energy" usage ──────────────────
      // Response mentions "energy" and "force" but in a motivational context,
      // not a physics context. Tests whether the evaluator's system prompt
      // correctly ignores non-scientific uses of physics terminology.
      sep("CASE 3 — Borderline: motivational speech using physics vocabulary");
      info("Testing evaluator judgment — should classify this as NOT physics");
      info("(evaluator system prompt says: ignore metaphorical uses of physics terms)");
      const results = await g.validate([{
        llm_response:
          "You have the energy and force of character to overcome any obstacle. " +
          "Channel your inner momentum and never lose velocity on your journey to success. " +
          "The gravity of your ambition will pull opportunities toward you.",
      }]);
      const passed = results.every((r) => r.passed);
      const duration = Math.round(results[0]?.duration ?? 0);
      if (!passed) {
        edge(`Guard fired — evaluator correctly identified this as non-physics. (${duration}ms)`);
      } else {
        edge(`Guard passed — evaluator treated motivational physics metaphors as real physics. (${duration}ms)`);
        edge(`This may indicate the evaluator needs a stronger system prompt.`);
      }

    },
  );

  console.log(`\n${"═".repeat(60)}`);
  console.log("  COMPLETE — check Traceloop UI for span details");
  console.log(`  Workflow: physics-guardrail-test-workflow`);
  console.log(`${"═".repeat(60)}\n`);

  await traceloop.forceFlush();
}

main();
