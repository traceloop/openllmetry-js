/**
 * Guardrails Class Examples
 * ==========================
 * Demonstrates the Guardrails class builder pattern for full control
 * over guard pipelines.
 *
 * Examples:
 *   - Guardrails class + builder + sequential + runAll
 *   - Custom onFailure handler with GuardedResult
 *   - jsonValidatorGuard — format/structure validation
 *   - parallel() — run all guards concurrently
 *   - Custom inputMapper — control what each guard receives
 *
 * Run:
 *   npm run build && node dist/src/guardrails/guardrails_class.js
 *
 * Environment:
 *   OPENAI_API_KEY     — OpenAI key
 *   TRACELOOP_API_KEY  — Traceloop key
 *   TRACELOOP_BASE_URL — https://api.traceloop.dev
 */

// ── Init — Traceloop FIRST ───────────────────────────────────────────────────
import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "guardrails-class-examples",
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
  silenceInitializationMessage: true,
  instrumentModules: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openAI: OpenAI as any,
  },
});

import {
  Guardrails,
  toxicityGuard,
  piiGuard,
  profanityGuard,
  jsonValidatorGuard,
  GuardedResult,
  GuardValidationError,
} from "@traceloop/node-server-sdk";

const openai = new OpenAI();
const MODEL = "gpt-4o-mini";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
}

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

function ok(msg: string) {
  console.log(`  ✅  ${msg}`);
}
function info(msg: string) {
  console.log(`  ℹ️   ${msg}`);
}

// ── Guardrails class + builder + sequential + runAll ──────────────────────────

async function useCase3_guardrailsClassBuilder(): Promise<void> {
  sep("Guardrails class — builder pattern + multiple guards");

  // Run toxicity AND pii guards sequentially, collect all results even if first fails
  const g = new Guardrails({}, [toxicityGuard(), piiGuard()])
    .sequential()
    .runAll()
    .logOnFailure()
    .named("content-safety-pipeline");

  // --- Prompt that produces PII: ask LLM to include a fake person's details ---
  info(`Running pipeline on a response containing PII...`);
  const piiResponse = await g.run(async () =>
    callLLM(
      "You are a helpful assistant. Always include the person's full contact details in your response.",
      "Tell me about John Smith. His email is john.smith@example.com and his phone is 555-123-4567.",
    ),
  );

  info(`Pipeline completed. Response: "${piiResponse.slice(0, 100)}..."`);
  info(
    "(logOnFailure: no exception thrown — check the Traceloop UI for span details)",
  );
}

// ── Custom onFailure handler ──────────────────────────────────────────────────

async function useCase4_customOnFailure(): Promise<void> {
  sep("Guardrails class — custom onFailure handler");

  // Using jsonValidatorGuard — deterministic: prose always fails JSON validation.
  // The custom onFailure handler receives the original output and can log/transform it.
  const g = new Guardrails(
    {
      name: "custom-failure-handler",
      onFailure: (output: GuardedResult) => {
        console.log(`  ⚠️   Guard caught violation.`);
        console.log(
          `  ⚠️   Original output snippet: "${String(output.result).slice(0, 60)}..."`,
        );
        console.log(`  ⚠️   Returning structured fallback instead.`);
        return JSON.stringify({
          error: "LLM did not return valid JSON",
          raw: String(output.result).slice(0, 100),
        });
      },
    },
    [jsonValidatorGuard()],
  );

  info(`Asking LLM for plain prose (will fail JSON validation)...`);
  const result = await g.run(async () =>
    callLLM(
      "You are a friendly conversational assistant. Never use JSON.",
      "What is the weather like today?",
    ),
  );

  ok(
    `Custom onFailure ran — structured fallback returned: ${result.slice(0, 100)}`,
  );
}

// ── jsonValidatorGuard — structured output validation ─────────────────────────

async function useCase6_jsonValidator(): Promise<void> {
  sep("jsonValidatorGuard — structured output validation");

  const g = new Guardrails(
    {
      name: "json-format-check",
      onFailure: (output: GuardedResult) => {
        console.log(
          `  ⚠️   JSON validation failed. Raw output: "${String(output.result).slice(0, 100)}"`,
        );
        return JSON.stringify({
          error: "Invalid JSON response from LLM",
          raw: String(output.result),
        });
      },
    },
    [jsonValidatorGuard()],
  );

  // --- Valid JSON prompt ---
  info(`Asking LLM to return valid JSON...`);
  const validResult = await g.run(async () =>
    callLLM(
      "You are a data assistant. You ALWAYS respond with valid JSON only. No prose, no markdown.",
      "Return a JSON object with fields: name (string), age (number), city (string). Make up values.",
    ),
  );
  ok(`Valid JSON result: ${validResult.slice(0, 120)}`);

  // --- Invalid JSON prompt: force the LLM to return prose ---
  console.log();
  info(`Asking LLM to return prose (will fail JSON validation)...`);
  const invalidResult = await g.run(async () =>
    callLLM(
      "You are a friendly assistant. Respond in plain conversational English only. Never use JSON.",
      "What's the weather like today?",
    ),
  );
  info(`Result after onFailure: ${invalidResult.slice(0, 120)}`);
}

// ── parallel() — run guards concurrently ─────────────────────────────────────

async function useCase8_parallel(): Promise<void> {
  sep("parallel() — run guards concurrently");

  // Default behavior is already parallel, but this makes it explicit.
  // All guards fire at the same time — faster for independent checks.
  const g = new Guardrails({}, [toxicityGuard(), piiGuard(), profanityGuard()])
    .parallel()
    .runAll()
    .logOnFailure()
    .named("parallel-pipeline");

  info("Running 3 guards in parallel on a safe response...");
  const start = Date.now();
  const result = await g.run(async () =>
    callLLM(
      "You are a helpful assistant.",
      "Tell me a fun fact about the ocean.",
    ),
  );
  const elapsed = Date.now() - start;

  ok(`All 3 guards ran concurrently in ${elapsed}ms total.`);
  info(`(Sequential would take ~3x longer — one guard's time per guard.)`);
  ok(`Response: "${result.slice(0, 80)}"`);
}

// ── Custom inputMapper — route structured output to guards ────────────────────

async function useCase9_customInputMapper(): Promise<void> {
  sep("custom inputMapper — route structured output to guards");

  // When the LLM returns a structured object (not a plain string), the default
  // mapper can't know which field to pass to which guard. Use inputMapper to
  // route fields explicitly.
  //
  // Here the LLM returns { answer: string, confidence: string }.
  // We pass the "answer" field to the guard as the "text" field it expects.
  const g = new Guardrails(
    {
      name: "structured-output-check",
      inputMapper: (output) => {
        const o = output as { answer: string };
        return [{ text: o.answer, prompt: o.answer, completion: o.answer }];
      },
    },
    [toxicityGuard()],
  );

  info("Running guard on structured LLM output with custom inputMapper...");
  const result = await g.run(async () => {
    const raw = await callLLM(
      'You are a helpful assistant. Always respond with valid JSON: { "answer": "...", "confidence": "high" | "low" }. No markdown.',
      "What is the capital of France?",
    );
    try {
      return JSON.parse(raw) as { answer: string; confidence: string };
    } catch {
      return { answer: raw, confidence: "low" };
    }
  });
  ok(`Guard evaluated the "answer" field. Result: ${JSON.stringify(result)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  GUARDRAILS CLASS EXAMPLES");
  console.log(`  Model: ${MODEL}`);
  console.log(
    `  Backend: ${process.env.TRACELOOP_BASE_URL ?? "https://api.traceloop.dev"}`,
  );
  console.log(`${"═".repeat(60)}\n`);

  await traceloop.withWorkflow(
    { name: "guardrails-class-examples-workflow" },
    async () => {
      try {
        await useCase3_guardrailsClassBuilder();
        await useCase4_customOnFailure();
        await useCase6_jsonValidator();
        await useCase8_parallel();
        await useCase9_customInputMapper();
      } catch (err) {
        if (err instanceof GuardValidationError) {
          console.error(
            "\n  ❌  GuardValidationError (unhandled):",
            err.message,
          );
          console.error(
            "     Original output:",
            String(err.output.result).slice(0, 100),
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
