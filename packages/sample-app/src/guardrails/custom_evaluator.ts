/**
 * Custom Evaluator Guard Example
 * ================================
 * Shows how to use a custom LLM-as-a-judge evaluator as a guard.
 *
 * Scenario: a physics education app that only answers physics questions.
 * The LLM response is checked with the custom evaluator guard to confirm
 * it actually contains physics content. Off-topic responses are blocked
 * and replaced with a fallback message.
 *
 * The custom evaluator uses a two-call HTTP flow:
 *   1. POST /v2/evaluators/{slug}/executions  — trigger the LLM judge
 *   2. GET  /v2{streamUrl}                    — blocking long-poll for result
 *
 * Prerequisites:
 *   - A custom evaluator with slug "custom-test" must exist on your backend.
 *     The evaluator should return { isValid: boolean, reasoning: string }.
 *     Its prompt template should use {llm_response} as the input variable.
 *
 * Run:
 *   npm run build && node dist/src/guardrails/custom_evaluator.js
 *
 * Environment:
 *   OPENAI_API_KEY     — OpenAI key
 *   TRACELOOP_API_KEY  — your Traceloop API key
 *   TRACELOOP_BASE_URL — https://api.traceloop.dev
 */

// ── Init — Traceloop FIRST ───────────────────────────────────────────────────
import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "guardrails-custom-evaluator-example",
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
  customEvaluatorGuard,
  isTrue,
} from "@traceloop/node-server-sdk";

const openai = new OpenAI();

// The slug of the custom evaluator on your Traceloop backend.
// The evaluator should accept {llm_response} and return { isValid: boolean }.
const EVALUATOR_SLUG = "custom-test";

const FALLBACK =
  "I can only help with physics questions. Please ask something related to physics.";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function askLLM(question: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content:
          "You are a physics tutor. Answer questions about physics concisely.",
      },
      { role: "user", content: question },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

// ── Guard setup ───────────────────────────────────────────────────────────────

// Custom evaluator guard — checks whether the LLM response is about physics.
// conditionField "isValid" maps to the boolean field in the evaluator output.
// The custom inputMapper passes the response under the {llm_response} template variable.
const physicsContentGuard = customEvaluatorGuard(EVALUATOR_SLUG, {
  conditionField: "isValid",
  condition: isTrue(),
  timeoutMs: 60000,
});

const responseGuard = new Guardrails(
  {
    name: "physics-response-check",
    onFailure: FALLBACK,
    // The custom evaluator template uses {llm_response} — map the LLM output to that field.
    inputMapper: (output) => [{ llm_response: output as string }],
  },
  [physicsContentGuard],
);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await traceloop.withWorkflow(
    { name: "custom-evaluator-example" },
    async () => {
      console.log(
        "\n── guard() on response — physics question → LLM → evaluator ──",
      );
      // A real physics question: LLM answers, custom evaluator confirms it's physics.

      const physicsQuestion =
        "How does Newton's second law relate force and mass?";
      console.log(`Question: "${physicsQuestion}"`);

      const llmResponse = await askLLM(physicsQuestion);
      console.log(`LLM response: "${llmResponse.slice(0, 100)}..."`);

      const start = Date.now();
      const physicsResult = await responseGuard.run(async () => llmResponse);
      const duration = Date.now() - start;

      console.log(
        `Custom evaluator result: ${physicsResult !== FALLBACK ? "✅ physics confirmed" : "🚫 not physics"} (${duration}ms)`,
      );

      console.log(
        "\n── off-topic question → LLM → evaluator blocks response ──",
      );
      // An off-topic question: LLM answers about cooking, evaluator blocks it.

      const offTopicQuestion = "What is the best way to cook pasta?";
      console.log(`Question: "${offTopicQuestion}"`);

      const offTopicResponse = await askLLM(offTopicQuestion);
      console.log(`LLM response: "${offTopicResponse.slice(0, 100)}..."`);

      // run() calls the guard and invokes onFailure (returns FALLBACK) if blocked
      const finalResponse = await responseGuard.run(
        async () => offTopicResponse,
      );
      console.log(`Response shown to user: "${finalResponse}"`);

      console.log(
        "\n── done ───────────────────────────────────────────────────",
      );
      console.log("Check the Traceloop UI for span details.\n");
    },
  );

  await traceloop.forceFlush();
}

main();
