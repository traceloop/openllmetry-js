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

import * as CerebrasModule from "@cerebras/cerebras_cloud_sdk";

import { CerebrasInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { ChatCompletion } from "@cerebras/cerebras_cloud_sdk/resources/chat/completions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test Cerebras instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: CerebrasInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let cerebras: CerebrasModule.Cerebras;

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
      process.env.CEREBRAS_API_KEY = "test-key";
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new CerebrasInstrumentation();
    instrumentation.setTracerProvider(provider);

    const cerebrasModule: typeof CerebrasModule = await import(
      "@cerebras/cerebras_cloud_sdk"
    );
    cerebras = new cerebrasModule.Cerebras();
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "authorization",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for completions", async () => {
    const result = await cerebras.completions.create({
      model: "llama-3.1-8b",
      max_tokens: 300,
      prompt: `Tell me a joke about OpenTelemetry`,
    });
    if ("error" in result) {
      throw new Error(result.error as string);
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "cerebras.completion",
    );

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "llama-3.1-8b",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      300,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "llama3.1-8b",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `Tell me a joke about OpenTelemetry`,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      result.choices![0].text,
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      9,
    );
    assert.equal(
      completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ],
      300,
    );
    assert.equal(
      +completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +completionSpan.attributes[
          `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
        ]!,
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it("should set attributes in span for completions (streaming)", async () => {
    const result = await cerebras.completions.create({
      model: "llama-3.1-8b",
      max_tokens: 300,
      prompt: `Tell me a joke about OpenTelemetry`,
      stream: true,
    });

    let completion = "";
    for await (const chunk of result) {
      assert.ok(chunk);
      completion += chunk.choices[0].text;
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "cerebras.completion",
    );

    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "llama-3.1-8b",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MAX_TOKENS}`],
      300,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "llama3.1-8b",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `Tell me a joke about OpenTelemetry`,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      completion,
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      9,
    );
    assert.equal(
      completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ],
      300,
    );
    assert.equal(
      +completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +completionSpan.attributes[
          `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
        ]!,
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it("should set attributes in span for messages", async () => {
    const completion = await cerebras.chat.completions.create({
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "llama-3.1-8b",
    });

    if ("error" in completion) {
      throw new Error(completion.error as string);
    }
    const choice = completion
      .choices?.[0] as ChatCompletion.ChatCompletionResponse.Choice;
    if (!choice) {
      throw new Error("No choice from completion");
    }

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "cerebras.chat");

    assert.ok(completion);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "llama-3.1-8b",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "llama3.1-8b",
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
      choice.message.content as string,
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      43,
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`],
      25,
    );
    assert.equal(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]!,
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);

  it("should set attributes in span for messages (streaming)", async () => {
    const stream = await cerebras.chat.completions.create({
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "llama-3.1-8b",
      stream: true,
    });

    let content = "";
    for await (const chunk of stream) {
      assert.ok(chunk);
      content += (chunk as any).choices[0]?.delta?.content || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "cerebras.chat");

    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "llama-3.1-8b",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "llama3.1-8b",
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
      content,
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      43,
    );
    assert.equal(
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`],
      39,
    );
    assert.equal(
      +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`]! +
        +chatSpan.attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`]!,
      chatSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
  }).timeout(30000);
});
