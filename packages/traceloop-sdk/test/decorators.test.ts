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

import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";

import type * as OpenAIModule from "openai";

import * as traceloop from "../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test SDK Decorators", () => {
  let openai: OpenAIModule.OpenAI;

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
      process.env.OPENAI_API_KEY = "test";
    }

    traceloop.initialize({
      appName: "test_decorators",
      disableBatch: true,
      exporter: memoryExporter,
    });

    const openAIModule: typeof OpenAIModule = await import("openai");
    openai = new openAIModule.OpenAI();
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "authorization",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
  });

  it("should create spans for workflows using withWorkflow syntax", async () => {
    const jokeSubject = "OpenTelemetry";
    const result = await traceloop.withWorkflow(
      "sample_chat",
      {},
      async () => {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: `Tell me a joke about ${jokeSubject}` },
          ],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
      { jokeSubject },
    );

    const spans = memoryExporter.getFinishedSpans();
    const workflowSpan = spans.find(
      (span) => span.name === "sample_chat.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "workflow",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_INPUT}`],
      JSON.stringify({ args: [], kwargs: { jokeSubject: "OpenTelemetry" } }),
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      JSON.stringify(result),
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should create spans for workflows using decoration syntax", async () => {
    class TestOpenAI {
      @traceloop.workflow("sample_chat")
      async chat(subject: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: `Tell me a joke about ${subject}` },
          ],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testOpenAI = new TestOpenAI();
    const result = await testOpenAI.chat("OpenTelemetry");

    const spans = memoryExporter.getFinishedSpans();
    const workflowSpan = spans.find(
      (span) => span.name === "sample_chat.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "workflow",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_INPUT}`],
      JSON.stringify({ args: ["OpenTelemetry"], kwargs: {} }),
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      JSON.stringify(result),
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should not log prompts if traceContent is disabled", async () => {
    traceloop.toggleShouldSendTraces(false);

    const jokeSubject = "OpenTelemetry";
    const result = await traceloop.withWorkflow(
      "sample_chat",
      {},
      async () => {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: `Tell me a joke about ${jokeSubject}` },
          ],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
      { jokeSubject },
    );

    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "sample_chat.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "workflow",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_INPUT}`],
      undefined,
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      undefined,
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "sample_chat",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      undefined,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      undefined,
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      undefined,
    );
  });
});
