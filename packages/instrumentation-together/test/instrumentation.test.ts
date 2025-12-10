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

import type * as TogetherAIModule from "together-ai";

import { TogetherInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test Together instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: TogetherInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let together: TogetherAIModule.Together;

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
      process.env.TOGETHER_API_KEY = "test";
    }
    // span processor is already set up during provider initialization
    instrumentation = new TogetherInstrumentation({ enrichTokens: true });
    instrumentation.setTracerProvider(provider);

    const togetherModule: typeof TogetherAIModule = await import("together-ai");
    together = new togetherModule.Together();
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

  it("should set attributes in span for function calling", async () => {
    const result = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
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
      function_call: "auto",
    });

    const spans = memoryExporter.getFinishedSpans();

    const completionSpan = spans.find((span) => span.name === "together.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
      "What's the weather like in Boston?",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.name`
      ],
      "get_current_weather",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.description`
      ],
      "Get the current weather in a given location",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.arguments`
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
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.arguments`
        ]! as string,
      ),
      { location: "Boston, MA" },
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_USAGE_PROMPT_TOKENS}`],
      333,
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should set attributes in span for chat", async () => {
    try {
      const result = await together.chat.completions.create({
        messages: [
          { role: "user", content: "Tell me a joke about OpenTelemetry" },
        ],
        model: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      });

      const spans = memoryExporter.getFinishedSpans();

      const completionSpan = spans.find(
        (span) => span.name === "together.chat",
      );

      assert.ok(result);
      assert.ok(completionSpan);
      assert.strictEqual(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
        "user",
      );
      assert.strictEqual(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
        "Tell me a joke about OpenTelemetry",
      );
      assert.ok(
        completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
      );
      assert.equal(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_USAGE_PROMPT_TOKENS}`],
        37,
      );
      assert.ok(
        +completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
        ]! > 0,
      );
    } catch (error) {
      console.error("Error in test:", error);
      throw error;
    }
  });

  it("should set attributes in span for streaming chat", async () => {
    try {
      const stream = await together.chat.completions.create({
        messages: [
          { role: "user", content: "Tell me a joke about OpenTelemetry" },
        ],
        model: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        stream: true,
      });

      let result = "";

      for await (const chunk of stream) {
        result += chunk.choices[0]?.delta?.content || "";
      }

      const spans = memoryExporter.getFinishedSpans();

      const completionSpan = spans.find(
        (span) => span.name === "together.chat",
      );

      assert.ok(result);
      assert.ok(completionSpan);
      assert.strictEqual(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
        "user",
      );
      assert.strictEqual(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
        "Tell me a joke about OpenTelemetry",
      );
      assert.strictEqual(
        completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`
        ],
        result,
      );
      assert.ok(
        completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
      );
      assert.equal(
        completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_USAGE_PROMPT_TOKENS}`],
        37,
      );
      assert.ok(
        +completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
        ]! > 0,
      );
    } catch (error) {
      console.error("Error in streaming test:", error);
      throw error;
    }
  });

  it("should set attributes in span for completion", async () => {
    const result = await together.completions.create({
      prompt: "Tell me a joke about OpenTelemetry",
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    });

    const spans = memoryExporter.getFinishedSpans();

    const completionSpan = spans.find(
      (span) => span.name === "together.completion",
    );

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`],
      "assistant",
    );
    assert.ok(
      typeof completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`
      ] === "string" &&
        (
          completionSpan.attributes[
            `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`
          ] as string
        ).length > 0,
    );
  });

  it("should set attributes in span for streaming completion", async () => {
    const stream = await together.completions.create({
      prompt: "Tell me a joke about OpenTelemetry",
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      stream: true,
    });

    let result = "";
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;

      result += chunk.choices[0]?.text || "";
    }

    const spans = memoryExporter.getFinishedSpans();

    const completionSpan = spans.find(
      (span) => span.name === "together.completion",
    );

    assert.ok(result, "Result should not be empty");
    assert.ok(completionSpan, "Completion span should exist");
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
      "Prompt role should be 'user'",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
      "Tell me a joke about OpenTelemetry",
      "Prompt content should match input",
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
      "Total tokens should be set",
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
      "Completion tokens should be greater than 0",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`],
      "assistant",
      "Completion role should be 'assistant'",
    );
    assert.ok(
      typeof completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`
      ] === "string" &&
        (
          completionSpan.attributes[
            `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`
          ] as string
        ).length > 0,
      "Completion content should not be empty",
    );
  });

  it("should set attributes in span for tool calling", async () => {
    const result = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
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
    const completionSpan = spans.find((span) => span.name === "together.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`],
      "What's the weather like in Boston?",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.name`
      ],
      "get_current_weather",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.description`
      ],
      "Get the current weather in a given location",
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_TOOL_NAME}.0.arguments`
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
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.arguments`
        ]! as string,
      ),
      { location: "Boston, MA" },
    );
    assert.ok(
      completionSpan.attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`],
    );
    assert.equal(
      completionSpan.attributes[`${SpanAttributes.ATTR_GEN_AI_USAGE_PROMPT_TOKENS}`],
      333,
    );
    assert.ok(
      +completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS}`
      ]! > 0,
    );
  });

  it("should set function_call attributes in span for stream completion when multiple tools called", async () => {
    const stream = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
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
    const completionSpan = spans.find((span) => span.name === "together.chat");

    assert.strictEqual(result, "");
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.name`
      ],
      "get_current_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.arguments`
        ]! as string,
      ),
      { location: "Boston, MA", unit: "fahrenheit" },
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.name`
      ],
      "get_tomorrow_weather",
    );
    assert.deepEqual(
      JSON.parse(
        completionSpan.attributes[
          `${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.function_call.arguments`
        ]! as string,
      ),
      { location: "Chicago, IL", unit: "fahrenheit" },
    );
  });
});
