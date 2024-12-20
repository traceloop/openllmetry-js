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

import { openai as vercel_openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import * as traceloop from "../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test SDK Decorators", () => {
  let openai: OpenAIModule.OpenAI;

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
      { name: "sample_chat", associationProperties: { userId: "123" } },
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
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
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
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
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

  it("should not create spans if suppressed", async () => {
    const jokeSubject = "OpenTelemetry";
    const result = await traceloop.withWorkflow(
      {
        name: "sample_chat",
        associationProperties: { userId: "123" },
        suppressTracing: true,
      },
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

    assert.ok(result);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 0);
  });

  it("should create spans for workflows using decoration syntax", async () => {
    class TestOpenAI {
      @traceloop.workflow({ name: "sample_chat", version: 2 })
      async chat(things: Map<string, string>) {
        const generations: Map<string, string> = new Map();
        for await (const [key, value] of things) {
          const chatCompletion = await openai.chat.completions.create({
            messages: [
              { role: "user", content: `Tell me a ${key} about ${value}` },
            ],
            model: "gpt-3.5-turbo",
          });

          if (chatCompletion.choices[0].message.content) {
            generations.set(key, chatCompletion.choices[0].message.content);
          }
        }

        return generations;
      }
    }

    const testOpenAI = new TestOpenAI();
    const result = await testOpenAI.chat(
      new Map([
        ["joke", "OpenTelemetry"],
        ["fact", "JavaScript"],
      ]),
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
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_VERSION}`],
      2,
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_INPUT}`],
      JSON.stringify({
        args: [
          [
            ["joke", "OpenTelemetry"],
            ["fact", "JavaScript"],
          ],
        ],
        kwargs: {},
      }),
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      JSON.stringify([
        ["joke", result.get("joke")],
        ["fact", result.get("fact")],
      ]),
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

  it("should create spans for workflows using decoration syntax, method variant", async () => {
    class TestOpenAI {
      constructor(private model = "gpt-3.5-turbo") {}

      @traceloop.workflow((thisArg, { things }) => ({
        name: `${(thisArg as TestOpenAI).model}_${(things as Map<string, string>).get("joke")}`,
      }))
      async chat({ things }: { things: Map<string, string> }) {
        const generations: Map<string, string> = new Map();
        for await (const [key, value] of things) {
          const chatCompletion = await openai.chat.completions.create({
            messages: [
              { role: "user", content: `Tell me a ${key} about ${value}` },
            ],
            model: this.model,
          });

          if (chatCompletion.choices[0].message.content) {
            generations.set(key, chatCompletion.choices[0].message.content);
          }
        }

        return generations;
      }
    }

    const testOpenAI = new TestOpenAI();
    const result = await testOpenAI.chat({
      things: new Map([
        ["joke", "OpenTelemetry"],
        ["fact", "JavaScript"],
      ]),
    });

    const spans = memoryExporter.getFinishedSpans();
    const workflowName = "gpt-3.5-turbo_OpenTelemetry";
    const workflowSpan = spans.find(
      (span) => span.name === `${workflowName}.workflow`,
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      workflowName,
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "workflow",
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      workflowName,
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_INPUT}`],
      JSON.stringify({
        args: [],
        kwargs: {
          things: [
            ["joke", "OpenTelemetry"],
            ["fact", "JavaScript"],
          ],
        },
      }),
    );
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      JSON.stringify([
        ["joke", result.get("joke")],
        ["fact", result.get("fact")],
      ]),
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      workflowName,
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
    const jokeSubject = "OpenTelemetry";
    const result = await traceloop.withWorkflow(
      { name: "sample_chat", traceContent: false },
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

  it("should create spans for manual LLM instrumentation", async () => {
    const result = await traceloop.withWorkflow(
      { name: "joke_generator", associationProperties: { userId: "123" } },
      () =>
        traceloop.withLLMCall(
          { vendor: "openai", type: "chat" },
          async ({ span }) => {
            const messages: ChatCompletionMessageParam[] = [
              { role: "user", content: "Tell me a joke about OpenTelemetry" },
            ];
            const model = "gpt-3.5-turbo";

            span.reportRequest({ model, messages });

            const response = await openai.chat.completions.create({
              messages,
              model,
            });

            span.reportResponse(response);

            return response;
          },
        ),
    );

    const spans = memoryExporter.getFinishedSpans();
    const workflowSpan = spans.find(
      (span) => span.name === "joke_generator.workflow",
    );
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.ok(workflowSpan);
    assert.strictEqual(
      workflowSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "joke_generator",
    );
    assert.strictEqual(
      completionSpan.parentSpanId,
      workflowSpan.spanContext().spanId,
    );

    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );

    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_TYPE}`],
      "chat",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "gpt-3.5-turbo",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "gpt-3.5-turbo-0125",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      result.choices[0].message.content,
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      "15",
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should not mix association properties for traces that run in parallel", async () => {
    class TestOpenAI {
      constructor(private userId: string) {}

      @traceloop.workflow((thisArg) => ({
        name: "chat",
        associationProperties: { userId: (thisArg as TestOpenAI).userId },
      }))
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

    const result1 = await new TestOpenAI("123").chat("OpenTelemetry");
    const result2 = await new TestOpenAI("456").chat("Typescript");

    const spans = memoryExporter.getFinishedSpans();

    assert.ok(result1);
    assert.ok(result2);

    const openAI1Span = spans.find(
      (span) =>
        span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] ===
        "Tell me a joke about OpenTelemetry",
    );
    const openAI2Span = spans.find(
      (span) =>
        span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] ===
        "Tell me a joke about Typescript",
    );

    assert.ok(openAI1Span);
    assert.ok(openAI2Span);

    assert.strictEqual(
      openAI1Span.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
    assert.strictEqual(
      openAI2Span.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "456",
    );
  });

  it("should create workflow and tasks spans with chained entity names", async () => {
    class TestOpenAI {
      @traceloop.workflow({ name: "joke_creation_chat", version: 3 })
      async chat() {
        return await this.jokeCreationTaskWrapper();
      }

      @traceloop.task({ name: "joke_creation_task_wrapper", version: 2 })
      async jokeCreationTaskWrapper() {
        return await this.jokeCreation();
      }

      @traceloop.task({ name: "joke_creation", version: 2 })
      async jokeCreation() {
        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "Tell me a joke about pirates" }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testOpenAI = new TestOpenAI();
    const result = await testOpenAI.chat();
    const spans = memoryExporter.getFinishedSpans();
    const jokeCreationTaskWrapperSpan = spans.find(
      (span) => span.name === "joke_creation_task_wrapper.task",
    );
    const jokeCreationSpan = spans.find(
      (span) => span.name === "joke_creation.task",
    );
    const openAiChatSpans = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(jokeCreationTaskWrapperSpan);
    assert.ok(jokeCreationSpan);
    assert.ok(openAiChatSpans);
    assert.strictEqual(
      jokeCreationTaskWrapperSpan.attributes[
        `${SpanAttributes.TRACELOOP_ENTITY_NAME}`
      ],
      "joke_creation_task_wrapper",
    );
    assert.strictEqual(
      jokeCreationSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_PATH}`],
      "joke_creation_task_wrapper",
    );
    assert.strictEqual(
      openAiChatSpans.attributes[`${SpanAttributes.TRACELOOP_ENTITY_PATH}`],
      "joke_creation_task_wrapper.joke_creation",
    );
    assert.strictEqual(
      jokeCreationSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_OUTPUT}`],
      JSON.stringify(result),
    );
  });

  it("should fix Vercel AI spans to match OpenLLMetry format", async () => {
    const result = await generateText({
      messages: [{ role: "user", content: "What is the capital of France?" }],
      model: vercel_openai("gpt-3.5-turbo"),
      experimental_telemetry: { isEnabled: true },
    });

    const spans = memoryExporter.getFinishedSpans();

    const generateTextSpan = spans.find(
      (span) => span.name === "ai.generateText.generate",
    );

    assert.ok(result);
    assert.ok(generateTextSpan);
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      `[{"type":"text","text":"What is the capital of France?"}]`,
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_REQUEST_MODEL}`],
      "gpt-3.5-turbo",
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_RESPONSE_MODEL}`],
      "gpt-3.5-turbo-0125",
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      generateTextSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.content`
      ],
      result.text,
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      14,
    );
    assert.strictEqual(
      generateTextSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ],
      8,
    );
    assert.strictEqual(
      generateTextSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
      22,
    );
  });
});
