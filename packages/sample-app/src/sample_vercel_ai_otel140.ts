/**
 * Vercel AI SDK - OTel 1.40 Migration Validation Sample
 *
 * Covers all major use cases to validate span shapes after the OTel 1.40 migration:
 *   1. generateText  - OpenAI + Anthropic (basic chat)
 *   2. streamText    - OpenAI streaming
 *   3. generateObject - structured output
 *   4. generateText with tools + multi-step (agentic loop)
 *   5. Agent span naming via ai.telemetry.metadata.agent
 *   6. Conversation ID propagation
 *
 * Run via run.sh (sets OPENAI_API_KEY, ANTHROPIC_API_KEY, TRACELOOP_API_KEY).
 *
 * Key attributes to verify in Traceloop dashboard:
 *   - gen_ai.provider.name  → "openai" / "anthropic"  (OTel 1.40 lowercase)
 *   - gen_ai.request.model  → model name
 *   - gen_ai.operation.name → "chat" / "execute_tool"
 *   - gen_ai.input.messages → [{role, parts:[{type:"text",content:...}]}]
 *   - gen_ai.output.messages → [{role,finish_reason,parts:[...]}]
 *   - gen_ai.usage.input_tokens / output_tokens
 *   - gen_ai.response.finish_reasons → ["stop"] / ["tool_call"]
 *   - gen_ai.tool.definitions → JSON array of tool objects (source format)
 *   - Span name format: "chat {model}" / "execute_tool {toolName}"
 */

import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  generateText,
  streamText,
  generateObject,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";

traceloop.initialize({
  appName: "sample_vercel_ai_otel140",
  disableBatch: true,
});

// ─── Shared tools ──────────────────────────────────────────────────────────

const getWeather = tool({
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name"),
    units: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
  }),
  execute: async ({ location, units }) => {
    console.log(`  [tool] getWeather(${location}, ${units})`);
    return {
      location,
      temperature: units === "celsius" ? 22 : 72,
      condition: "Sunny",
      humidity: 55,
    };
  },
});

const searchWeb = tool({
  description: "Search the web for information",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
  }),
  execute: async ({ query }) => {
    console.log(`  [tool] searchWeb("${query}")`);
    return {
      results: [
        { title: `Result 1 for: ${query}`, url: "https://example.com/1" },
        { title: `Result 2 for: ${query}`, url: "https://example.com/2" },
      ],
    };
  },
});

// ─── 1. Basic generateText — OpenAI ────────────────────────────────────────

async function testGenerateTextOpenAI() {
  console.log("\n▶ [1] generateText — OpenAI");

  const result = await traceloop.withWorkflow(
    { name: "openai_basic_chat" },
    async () =>
      generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          { role: "system", content: "You are a concise assistant." },
          { role: "user", content: "What is the capital of France?" },
        ],
        experimental_telemetry: {
          isEnabled: true,
          metadata: { scenario: "basic_chat", provider: "openai" },
        },
      }),
  );

  console.log(`  Response: ${result.text}`);
  console.log(
    `  Tokens: ${result.usage.promptTokens} in / ${result.usage.completionTokens} out`,
  );
}

// ─── 2. Basic generateText — Anthropic ─────────────────────────────────────

async function testGenerateTextAnthropic() {
  console.log("\n▶ [2] generateText — Anthropic");

  const result = await traceloop.withWorkflow(
    { name: "anthropic_basic_chat" },
    async () =>
      generateText({
        model: anthropic("claude-haiku-4-5"),
        messages: [
          { role: "user", content: "What is the capital of Germany?" },
        ],
        experimental_telemetry: {
          isEnabled: true,
          metadata: { scenario: "basic_chat", provider: "anthropic" },
        },
      }),
  );

  console.log(`  Response: ${result.text}`);
  console.log(
    `  Tokens: ${result.usage.promptTokens} in / ${result.usage.completionTokens} out`,
  );
}

// ─── 3. streamText — OpenAI ─────────────────────────────────────────────────

async function testStreamText() {
  console.log("\n▶ [3] streamText — OpenAI");

  const result = await traceloop.withWorkflow(
    { name: "openai_stream" },
    async () => {
      const stream = streamText({
        model: openai("gpt-4o-mini"),
        prompt: "Count from 1 to 5, one number per line.",
        experimental_telemetry: {
          isEnabled: true,
          metadata: { scenario: "streaming" },
        },
      });

      let fullText = "";
      process.stdout.write("  Stream: ");
      for await (const chunk of stream.textStream) {
        process.stdout.write(chunk);
        fullText += chunk;
      }
      console.log();
      return fullText;
    },
  );

  console.log(`  Streamed ${result.length} chars`);
}

// ─── 4. generateObject — structured output ──────────────────────────────────

async function testGenerateObject() {
  console.log("\n▶ [4] generateObject — OpenAI structured output");

  const result = await traceloop.withWorkflow(
    { name: "openai_structured_output" },
    async () =>
      generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          city: z.string(),
          country: z.string(),
          population: z.number(),
          famousFor: z.array(z.string()).max(3),
        }),
        prompt: "Give me facts about Paris, France.",
        experimental_telemetry: {
          isEnabled: true,
          metadata: { scenario: "structured_output" },
        },
      }),
  );

  console.log(`  Object:`, result.object);
}

// ─── 5. generateText with tools — multi-step agent loop ─────────────────────

async function testToolsOpenAI() {
  console.log("\n▶ [5] generateText + tools (multi-step) — OpenAI");

  await traceloop.withAgent({ name: "travel_researcher" }, async () =>
    generateText({
      model: openai("gpt-4o-mini"),
      prompt:
        "What's the weather in Tokyo right now? Also search for 'best things to do in Tokyo'.",
      tools: { getWeather, searchWeb },
      stopWhen: stepCountIs(4),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: "travel_researcher",
          scenario: "multi_step_tools",
        },
      },
    }),
  );

  console.log("  Agent completed tool-use loop");
}

// ─── 6. generateText with tools — Anthropic ─────────────────────────────────

async function testToolsAnthropic() {
  console.log("\n▶ [6] generateText + tools — Anthropic");

  await traceloop.withAgent({ name: "weather_agent_anthropic" }, async () =>
    generateText({
      model: anthropic("claude-haiku-4-5"),
      prompt: "What is the weather like in London?",
      tools: { getWeather },
      stopWhen: stepCountIs(3),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          agent: "weather_agent_anthropic",
          scenario: "tool_call_anthropic",
        },
      },
    }),
  );

  console.log("  Anthropic agent completed");
}

// ─── 7. Conversation ID propagation ─────────────────────────────────────────

async function testConversationId() {
  console.log("\n▶ [7] Conversation ID — OpenAI multi-turn");

  const conversationId = `conv-${Date.now()}`;

  await traceloop.withWorkflow({ name: "multi_turn_chat" }, async () => {
    const turn1 = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [{ role: "user", content: "My name is Alice." }],
      experimental_telemetry: {
        isEnabled: true,
        metadata: { conversationId, turn: "1" },
      },
    });
    console.log(`  Turn 1: ${turn1.text}`);

    const turn2 = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "user", content: "My name is Alice." },
        { role: "assistant", content: turn1.text },
        { role: "user", content: "What is my name?" },
      ],
      experimental_telemetry: {
        isEnabled: true,
        metadata: { conversationId, turn: "2" },
      },
    });
    console.log(`  Turn 2: ${turn2.text}`);
  });
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Vercel AI SDK — OTel 1.40 Migration Validation");
  console.log("=".repeat(60));

  await testGenerateTextOpenAI();
  await testGenerateTextAnthropic();
  await testStreamText();
  await testGenerateObject();
  await testToolsOpenAI();
  await testToolsAnthropic();
  await testConversationId();

  console.log("\n" + "=".repeat(60));
  console.log("  All scenarios complete — check Traceloop dashboard");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
