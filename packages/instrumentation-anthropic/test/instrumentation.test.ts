/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from "assert";

import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

import * as AnthropicModule from "@anthropic-ai/sdk";

import { AnthropicInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import FetchAdapter from "@pollyjs/adapter-fetch";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Anthropic instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: AnthropicInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let anthropic: AnthropicModule.Anthropic;

  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
    },
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.ANTHROPIC_API_KEY = "test-key";
    }
    // span processor is already set up during provider initialization
    instrumentation = new AnthropicInstrumentation();
    instrumentation.setTracerProvider(provider);

    const anthropicModule: typeof AnthropicModule = await import(
      "@anthropic-ai/sdk"
    );
    anthropic = new anthropicModule.Anthropic({
      // lazily de-reference global fetch so that we get the patched version from polly
      fetch: (...args) => globalThis.fetch(...args),
    });
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "x-api-key",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for completions", async () => {
    const result = await anthropic.completions.create({
      model: "claude-2",
      max_tokens_to_sample: 300,
      prompt: `${AnthropicModule.HUMAN_PROMPT} Tell me a joke about OpenTelemetry${AnthropicModule.AI_PROMPT}`,
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "anthropic.completion",
    );

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "claude-2",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      300,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "claude-2.1",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `${AnthropicModule.HUMAN_PROMPT} Tell me a joke about OpenTelemetry${AnthropicModule.AI_PROMPT}`,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      result.completion,
    );
  }).timeout(30000);

  it("should set attributes in span for completions (streaming)", async () => {
    const result = await anthropic.completions.create({
      model: "claude-2",
      max_tokens_to_sample: 300,
      prompt: `${AnthropicModule.HUMAN_PROMPT} Tell me a joke about OpenTelemetry${AnthropicModule.AI_PROMPT}`,
      stream: true,
    });

    let completion = "";
    for await (const chunk of result) {
      assert.ok(chunk);
      completion += chunk.completion;
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "anthropic.completion",
    );

    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "claude-2",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      300,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "claude-2.1",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `${AnthropicModule.HUMAN_PROMPT} Tell me a joke about OpenTelemetry${AnthropicModule.AI_PROMPT}`,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      completion,
    );
  }).timeout(30000);

  it("should set attributes in span for messages", async () => {
    const message = await anthropic.messages.create({
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "claude-3-opus-20240229",
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "anthropic.chat");

    assert.ok(message);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "claude-3-opus-20240229",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "claude-3-opus-20240229",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      1024,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `Tell me a joke about OpenTelemetry`,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      JSON.stringify(message.content),
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      17,
    );
    assert.ok(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]! >
        0,
    );
    assert.equal(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]!,
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it("should set attributes in span for messages (streaming)", async () => {
    const stream = anthropic.messages.stream({
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "claude-3-opus-20240229",
    });
    const message = await stream.finalMessage();

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "anthropic.chat");

    assert.ok(message);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "claude-3-opus-20240229",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "claude-3-opus-20240229",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      1024,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `Tell me a joke about OpenTelemetry`,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      JSON.stringify(message.content),
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      17,
    );
    assert.ok(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]! >
        0,
    );
    assert.equal(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]!,
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it("should place system prompt first for messages", async () => {
    const msg = await anthropic.messages.create({
      max_tokens: 10,
      model: "claude-3-opus-20240229",
      system: "You are a helpful assistant",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    });

    assert.ok(msg);
    const span = memoryExporter.getFinishedSpans().at(-1);

    assert.ok(span);
    assert.strictEqual(
      span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "system",
    );
    assert.strictEqual(
      span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "You are a helpful assistant",
    );
    assert.strictEqual(
      span.attributes[`${SpanAttributes.LLM_PROMPTS}.1.role`],
      "user",
    );
  }).timeout(30000);

  it("should set attributes in span for beta messages with thinking", async () => {
    const message = await anthropic.beta.messages.create({
      max_tokens: 2048,
      betas: ["interleaved-thinking-2025-05-14"],
      messages: [
        {
          role: "user",
          content: "What is 2+2? Think through this step by step.",
        },
      ],
      model: "claude-opus-4-1-20250805",
      thinking: {
        type: "enabled",
        budget_tokens: 1024,
      },
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "anthropic.chat");

    assert.ok(message);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "claude-opus-4-1-20250805",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "claude-opus-4-1-20250805",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      2048,
    );

    // Check if thinking parameters are captured (these will fail initially)
    assert.strictEqual(
      chatSpan.attributes["llm.request.thinking.type"],
      "enabled",
    );
    assert.strictEqual(
      chatSpan.attributes["llm.request.thinking.budget_tokens"],
      1024,
    );

    // Check prompts
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "What is 2+2? Think through this step by step.",
    );

    // Check that we capture both thinking and regular content blocks
    const content = JSON.parse(
      chatSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.content`
      ] as string,
    );
    assert.ok(Array.isArray(content));

    interface ContentBlock {
      type: string;
      thinking?: string;
      text?: string;
    }

    const thinkingBlock = content.find(
      (block: ContentBlock) => block.type === "thinking",
    );
    const textBlock = content.find(
      (block: ContentBlock) => block.type === "text",
    );

    assert.ok(thinkingBlock, "Should contain a thinking block");
    assert.ok(
      thinkingBlock.thinking,
      "Thinking block should have thinking content",
    );
    assert.ok(textBlock, "Should contain a text block");
    assert.ok(textBlock.text, "Text block should have text content");

    // Verify token usage includes thinking tokens
    const completionTokens =
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`];
    const promptTokens =
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`];
    const totalTokens =
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`];

    assert.ok(completionTokens && +completionTokens > 0);
    assert.ok(promptTokens && +promptTokens > 0);
    assert.equal(+promptTokens + +completionTokens, totalTokens);
  }).timeout(30000);
});
