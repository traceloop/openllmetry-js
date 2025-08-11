/* eslint-disable @typescript-eslint/no-non-null-assertion */
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

import type * as OpenAIModule from "openai";
import { toFile } from "openai";

import { OpenAIInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test OpenAI instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: OpenAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let openai: OpenAIModule.OpenAI;

  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    recordFailedRequests: true,
    mode: process.env.RECORD_MODE === "NEW" ? "record" : "replay",
    matchRequestsBy: {
      headers: false,
      url: {
        protocol: true,
        hostname: true,
        pathname: true,
        query: false,
      },
    },
    logging: true,
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }
    // span processor is already set up during provider initialization
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
      { location: "Boston" },
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

  it("should set attributes in span for image generation", async () => {
    await openai.images.generate({
      model: "gpt-image-1",
      prompt: "A test image",
      n: 1,
      size: "1024x1024",
      quality: "high",
    });

    const spans = memoryExporter.getFinishedSpans();
    const imageSpan = spans.find((span) => span.name === "openai.images.generate");
    assert.ok(imageSpan);

    assert.strictEqual(imageSpan.attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
    assert.strictEqual(imageSpan.attributes["gen_ai.request.type"], "image_generation");
    assert.strictEqual(imageSpan.attributes[SpanAttributes.LLM_REQUEST_MODEL], "gpt-image-1");
    assert.strictEqual(imageSpan.attributes["gen_ai.request.image.size"], "1024x1024");
    assert.strictEqual(imageSpan.attributes["gen_ai.request.image.count"], 1);
    assert.strictEqual(imageSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`], "A test image");
    assert.strictEqual(imageSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`], "user");
    
    // Check token usage calculation (high quality 1024x1024 should be ~4160 tokens)
    assert.ok(imageSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]);
    assert.ok(imageSpan.attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS]);
    
    // Check response content
    assert.ok(imageSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`]);
    assert.strictEqual(imageSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`], "assistant");
  });

  it("should set attributes in span for image editing", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const imagePath = path.join(__dirname, "test_edit_image.png");
    const mockImageFile = fs.createReadStream(imagePath);
    
    await openai.images.edit({
      image: mockImageFile,
      prompt: "Add a red hat",
      model: "gpt-image-1",
      n: 1,
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const editSpan = spans.find((span) => span.name === "openai.images.edit");
    assert.ok(editSpan);

    assert.strictEqual(editSpan.attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
    assert.strictEqual(editSpan.attributes["gen_ai.request.type"], "image_edit");
    assert.strictEqual(editSpan.attributes[SpanAttributes.LLM_REQUEST_MODEL], "gpt-image-1");
    assert.strictEqual(editSpan.attributes["gen_ai.request.image.size"], "1024x1024");
    assert.strictEqual(editSpan.attributes["gen_ai.request.image.count"], 1);
    assert.strictEqual(editSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`], "Add a red hat");
    assert.strictEqual(editSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`], "user");
    
    // Check token usage calculation
    assert.strictEqual(editSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS], 4160);
    assert.ok(editSpan.attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS]); // Should include prompt tokens
    
    // Check response content
    assert.ok(editSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`]);
    assert.strictEqual(editSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`], "assistant");
  });

  it("should set attributes in span for image variation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const imagePath = path.join(__dirname, "test_edit_image.png");
    const mockImageFile = fs.createReadStream(imagePath);
    
    await openai.images.createVariation({
      image: mockImageFile,
      model: "gpt-image-1", 
      n: 1,
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const variationSpan = spans.find((span) => span.name === "openai.images.createVariation");
    assert.ok(variationSpan);

    assert.strictEqual(variationSpan.attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
    assert.strictEqual(variationSpan.attributes["gen_ai.request.type"], "image_variation");
    assert.strictEqual(variationSpan.attributes[SpanAttributes.LLM_REQUEST_MODEL], "gpt-image-1");
    assert.strictEqual(variationSpan.attributes["gen_ai.request.image.size"], "1024x1024");
    assert.strictEqual(variationSpan.attributes["gen_ai.request.image.count"], 1);
    
    // Check token usage calculation
    assert.strictEqual(variationSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS], 4160);
    assert.ok(variationSpan.attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS]); // Should include estimated input tokens
    
    // Check response content
    assert.ok(variationSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`]);
    assert.strictEqual(variationSpan.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`], "assistant");
  });

  it("should calculate correct tokens for different quality levels", async () => {
    // Test low quality
    await openai.images.generate({
      model: "gpt-image-1",
      prompt: "Test low quality",
      quality: "low",
      size: "1024x1024",
    });

    // Test medium quality  
    await openai.images.generate({
      model: "gpt-image-1", 
      prompt: "Test medium quality",
      quality: "medium",
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const lowSpan = spans.find((span) => 
      span.name === "openai.images.generate" && 
      span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] === "Test low quality"
    );
    const mediumSpan = spans.find((span) => 
      span.name === "openai.images.generate" && 
      span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] === "Test medium quality"
    );

    assert.ok(lowSpan);
    assert.ok(mediumSpan);

    // Low quality should be 272 tokens
    assert.strictEqual(lowSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS], 272);
    
    // Medium quality should be 1056 tokens
    assert.strictEqual(mediumSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS], 1056);
  });
});
