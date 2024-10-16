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

import type * as OpenAIModule from "openai";

import { OpenAIInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test OpenAI instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: OpenAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
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
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new OpenAIInstrumentation({ enrichTokens: true });
    instrumentation.setTracerProvider(provider);

    const openAIModule: typeof OpenAIModule = await import("openai");
    openai = new openAIModule.OpenAI();
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

  it("should set attributes in span for chat", async () => {
    const result = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
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

  it("should set attributes in span for streaming chat", async () => {
    const stream = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
      stream: true,
    });

    let result = "";
    for await (const chunk of stream) {
      result += chunk.choices[0]?.delta?.content || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
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
      result,
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      "8",
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it.skip("should set attributes in span for streaming chat with new API", async () => {
    const stream = openai.beta.chat.completions.stream({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
      stream: true,
    });

    let result = "";
    for await (const chunk of stream) {
      result += chunk.choices[0]?.delta?.content || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
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
      result,
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
    );
    assert.ok(
      completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ],
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      "8",
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should set attributes in span for completion", async () => {
    const result = await openai.completions.create({
      prompt: "Tell me a joke about OpenTelemetry",
      model: "gpt-3.5-turbo-instruct",
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "openai.completion",
    );

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should set attributes in span for streaming completion", async () => {
    const stream = await openai.completions.create({
      prompt: "Tell me a joke about OpenTelemetry",
      model: "gpt-3.5-turbo-instruct",
      stream: true,
    });

    let result = "";
    for await (const chunk of stream) {
      result += chunk.choices[0]?.text || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find(
      (span) => span.name === "openai.completion",
    );

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should emit logprobs span event for chat completion", async () => {
    const result = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
      logprobs: true,
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");
    const event = completionSpan?.events.find((x) => x.name == "logprobs");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.ok(event);
    assert.ok(event.attributes?.["logprobs"]);
  });

  it("should emit logprobs span event for stream chat completion", async () => {
    const stream = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
      logprobs: true,
      stream: true,
    });

    let result = "";
    for await (const chunk of stream) {
      result += chunk.choices[0]?.delta?.content || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");
    const event = completionSpan?.events.find((x) => x.name == "logprobs");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.ok(event);
    assert.ok(event.attributes?.["logprobs"]);
  });

  it("should set attributes in span for function calling", async () => {
    const result = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "user", content: "What's the weather like in Boston?" },
      ],
      functions: [
        {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
              },
            },
            required: ["location"],
          },
        },
      ],
      function_call: "auto",
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "What's the weather like in Boston?",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`
      ],
      "get_current_weather",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`
      ],
      "Get the current weather in a given location",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.arguments`
      ],
      JSON.stringify({
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["location"],
      }),
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.function_call.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.function_call.arguments`
        ]! as string,
      ),
      { location: "Boston" },
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      82,
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should set attributes in span for tool calling", async () => {
    const result = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "user", content: "What's the weather like in Boston?" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and state, e.g. San Francisco, CA",
                },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                },
              },
              required: ["location"],
            },
          },
        },
      ],
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "What's the weather like in Boston?",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`
      ],
      "get_current_weather",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`
      ],
      "Get the current weather in a given location",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.arguments`
      ],
      JSON.stringify({
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["location"],
      }),
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.arguments`
        ]! as string,
      ),
      { location: "Boston, MA" },
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`],
      82,
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should set function_call attributes in span for stream completion when multiple tools called", async () => {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content:
            "What's the weather today in Boston and what will the weather be tomorrow in Chicago?",
        },
      ],
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and state, e.g. San Francisco, CA",
                },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                },
              },
              required: ["location"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_tomorrow_weather",
            description: "Get tomorrow's weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and state, e.g. San Francisco, CA",
                },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                },
              },
              required: ["location"],
            },
          },
        },
      ],
    });

    let result = "";
    for await (const chunk of stream) {
      result += chunk.choices[0]?.delta?.content || "";
    }

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.strictEqual(result, "");
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.arguments`
        ]! as string,
      ),
      { location: "Boston, MA" },
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.1.name`
      ],
      "get_tomorrow_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.1.arguments`
        ]! as string,
      ),
      { location: "Chicago, IL" },
    );
  });
});
