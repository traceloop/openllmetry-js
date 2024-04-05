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
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import * as AnthropicModule from "@anthropic-ai/sdk";

import { AnthropicInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test Anthropic instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: AnthropicInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let anthropic: AnthropicModule.Anthropic;

  setupPolly({
    adapters: ["node-http"],
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
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new AnthropicInstrumentation();
    instrumentation.setTracerProvider(provider);

    const anthropicModule: typeof AnthropicModule = await import(
      "@anthropic-ai/sdk"
    );
    anthropic = new anthropicModule.Anthropic();
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
    assert.equal(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]!,
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it.skip(
    "should set attributes in span for messages (streaming)",
    async () => {
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
      assert.equal(
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
          +chatSpan.attributes[
            `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
          ]!,
        chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
      );
    },
  ).timeout(30000);
});
