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
import {
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
} from "@opentelemetry/semantic-conventions/incubating";

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
    recordFailedRequests: false,
    mode: process.env.RECORD_MODE === "NEW" ? "record" : "replay",
    adapterOptions: {
      "node-http": {
        requestTimeout: 0,
        socketTimeout: 0,
      },
      fetch: {
        requestTimeout: 0,
        socketTimeout: 0,
      },
    },
    persisterOptions: {
      fs: {
        recordingsDir: "./test/recordings",
      },
    },
    matchRequestsBy: {
      headers: false,
      url: {
        protocol: true,
        hostname: true,
        pathname: true,
        query: false,
      },
      body: false,
    },
    timing: {
      enabled: false,
    },
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }
    // span processor is already set up during provider initialization
    instrumentation = new OpenAIInstrumentation({ enrichTokens: true });
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();

    const openAIModule: typeof OpenAIModule = await import("openai");

    // Use node-fetch for Polly.js compatibility with most requests
    const fetch = (await import("node-fetch")).default;
    openai = new openAIModule.OpenAI({
      fetch: fetch as any,
    });
    console.log("Using node-fetch for Polly.js compatibility");
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    if (this.polly) {
      const { server } = this.polly as Polly;
      server.any().on("beforePersist", (_req, recording) => {
        recording.request.headers = recording.request.headers.filter(
          ({ name }: { name: string }) => name !== "authorization",
        );
      });

      // Set passthrough mode for image generation endpoints during recording
      if (process.env.RECORD_MODE === "NEW") {
        server.any("https://api.openai.com/v1/images/*").passthrough();
      }

      // Add comprehensive error handling for debugging
      server.any().on("error", (error, req) => {
        console.log(`Polly error on ${req.method} ${req.url}:`, error);
      });
    }
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));

    assert.ok(result);
    assert.ok(completionSpan);
    assert.strictEqual(
      completionSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      "openai",
    );
    assert.strictEqual(
      completionSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      "chat",
    );

    // Check input messages
    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "Tell me a joke about OpenTelemetry",
    );

    // Finish reasons
    assert.deepEqual(
      completionSpan.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ["stop"],
    );

    assert.ok(
      completionSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
    );
    assert.equal(
      completionSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
      "15",
    );
    assert.ok(+completionSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]! > 0);
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));

    assert.ok(result);
    assert.ok(completionSpan);

    // Check input messages
    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "Tell me a joke about OpenTelemetry",
    );

    // Check output messages
    const outputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");
    assert.strictEqual(outputMessages[0].parts[0].content, result);

    assert.ok(
      completionSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
    );
    assert.equal(
      completionSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
      "8",
    );
    assert.ok(+completionSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]! > 0);
  });

  it("should set attributes in span for completion", async () => {
    const result = await openai.completions.create({
      prompt: "Tell me a joke about OpenTelemetry",
      model: "gpt-3.5-turbo-instruct",
    });

    const spans = memoryExporter.getFinishedSpans();
    const completionSpan = spans.find((span) =>
      span.name.startsWith("text_completion "),
    );

    assert.ok(result);
    assert.ok(completionSpan);

    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
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
    const completionSpan = spans.find((span) =>
      span.name.startsWith("text_completion "),
    );

    assert.ok(result);
    assert.ok(completionSpan);

    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));

    assert.ok(result);
    assert.ok(completionSpan);

    // Check input messages
    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "What's the weather like in Boston?",
    );

    // Tool definitions (OTel 1.40 gen_ai.tool.definitions)
    const toolDefs = JSON.parse(
      completionSpan.attributes["gen_ai.tool.definitions"] as string,
    );
    assert.strictEqual(toolDefs[0].name, "get_current_weather");
    assert.strictEqual(
      toolDefs[0].description,
      "Get the current weather in a given location",
    );

    // Output messages with tool call
    const outputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");
    const toolCallPart = outputMessages[0].parts.find(
      (p: any) => p.type === "tool_call",
    );
    assert.ok(toolCallPart);
    assert.strictEqual(toolCallPart.name, "get_current_weather");
    assert.deepEqual(toolCallPart.arguments, { location: "Boston" });

    // Finish reason
    assert.deepEqual(
      completionSpan.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ["tool_call"],
    );

    assert.ok(
      completionSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
    );
    assert.equal(completionSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 82);
    assert.ok(+completionSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]! > 0);
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));

    assert.ok(result);
    assert.ok(completionSpan);

    // Check input messages
    const inputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "What's the weather like in Boston?",
    );

    // Tool definitions (OTel 1.40)
    const toolDefs = JSON.parse(
      completionSpan.attributes["gen_ai.tool.definitions"] as string,
    );
    assert.strictEqual(toolDefs[0].name, "get_current_weather");

    // Output messages with tool calls
    const outputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");
    const toolCallPart = outputMessages[0].parts.find(
      (p: any) => p.type === "tool_call",
    );
    assert.ok(toolCallPart);
    assert.strictEqual(toolCallPart.name, "get_current_weather");
    // API returns either "Boston" or "Boston, MA" depending on the call
    assert.ok(
      toolCallPart.arguments.location === "Boston" ||
        toolCallPart.arguments.location === "Boston, MA",
    );

    assert.ok(
      completionSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
    );
    assert.equal(completionSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 82);
    assert.ok(+completionSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]! > 0);
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
    const completionSpan = spans.find((span) => span.name.startsWith("chat "));

    assert.strictEqual(result, "");
    assert.ok(completionSpan);

    // Check output messages with multiple tool calls
    const outputMessages = JSON.parse(
      completionSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");

    const toolCalls = outputMessages[0].parts.filter(
      (p: any) => p.type === "tool_call",
    );
    assert.strictEqual(toolCalls.length, 2);
    assert.strictEqual(toolCalls[0].name, "get_current_weather");
    assert.deepEqual(toolCalls[0].arguments, { location: "Boston, MA" });
    assert.strictEqual(toolCalls[1].name, "get_tomorrow_weather");
    assert.deepEqual(toolCalls[1].arguments, { location: "Chicago, IL" });
  });

  it("should set attributes in span for image generation", async function () {
    this.timeout(300000); // 5 minutes timeout for image generation

    await openai.images.generate({
      model: "dall-e-2",
      prompt: "A test image",
      n: 1,
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const imageSpan = spans.find((span) =>
      span.name.startsWith("image_generation "),
    );
    assert.ok(imageSpan);

    assert.strictEqual(
      imageSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      "openai",
    );
    assert.strictEqual(
      imageSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      "image_generation",
    );
    assert.strictEqual(
      imageSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      "dall-e-2",
    );
    assert.strictEqual(
      imageSpan.attributes["gen_ai.request.image.size"],
      "1024x1024",
    );
    assert.strictEqual(imageSpan.attributes["gen_ai.request.image.count"], 1);

    // Check input messages
    const inputMessages = JSON.parse(
      imageSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(inputMessages[0].parts[0].content, "A test image");

    // Check token usage calculation (dall-e-2 1024x1024 should be ~1056 tokens)
    assert.ok(imageSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]);
    assert.ok(imageSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]);

    // Check response content
    assert.ok(imageSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
  });

  it.skip("should set attributes in span for image editing", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const imagePath = path.join(__dirname, "test_edit_image.png");
    const imageBuffer = fs.readFileSync(imagePath);
    const mockImageFile = await toFile(imageBuffer, "test_edit_image.png", {
      type: "image/png",
    });

    await (openai as any).images.edit({
      image: mockImageFile,
      prompt: "Add a red hat",
      n: 1,
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const editSpan = spans.find((span) =>
      span.name.startsWith("image_edit "),
    );
    assert.ok(editSpan);

    assert.strictEqual(
      editSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      "openai",
    );
    assert.strictEqual(
      editSpan.attributes["gen_ai.request.type"],
      "image_edit",
    );

    // Check token usage calculation
    assert.strictEqual(
      editSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
      4160,
    );
    assert.ok(editSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS]);

    // Check response content
    assert.ok(editSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
  });

  it.skip("should set attributes in span for image variation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const imagePath = path.join(__dirname, "test_edit_image.png");
    const imageBuffer = fs.readFileSync(imagePath);
    const mockImageFile = await toFile(imageBuffer, "test_edit_image.png", {
      type: "image/png",
    });

    await (openai as any).images.createVariation({
      image: mockImageFile,
      n: 1,
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const variationSpan = spans.find((span) =>
      span.name.startsWith("image_variation "),
    );
    assert.ok(variationSpan);

    assert.strictEqual(
      variationSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      "openai",
    );

    // Check token usage calculation (DALL-E 2 1024x1024 = 1056 tokens)
    assert.strictEqual(
      variationSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
      1056,
    );
    assert.ok(
      variationSpan.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
    );

    // Check response content
    assert.ok(variationSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
  });

  it.skip("should calculate correct tokens for different quality levels", async function () {
    this.timeout(300000); // 5 minutes timeout for multiple image generations

    // Test dall-e-2 standard
    await openai.images.generate({
      model: "dall-e-2",
      prompt: "Test standard quality",
      size: "1024x1024",
    });

    // Test dall-e-3 HD
    await openai.images.generate({
      model: "dall-e-3",
      prompt: "Test HD quality",
      quality: "hd",
      size: "1024x1024",
    });

    const spans = memoryExporter.getFinishedSpans();
    const dalle2Span = spans.find(
      (span) =>
        span.name.startsWith("image_generation ") &&
        (span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)?.includes(
          "Test standard quality",
        ),
    );
    const dalle3Span = spans.find(
      (span) =>
        span.name.startsWith("image_generation ") &&
        (span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)?.includes(
          "Test HD quality",
        ),
    );

    assert.ok(dalle2Span);
    assert.ok(dalle3Span);

    // DALL-E 2 standard should be 1056 tokens
    assert.strictEqual(
      dalle2Span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
      1056,
    );

    // DALL-E 3 HD should be 4160 tokens
    assert.strictEqual(
      dalle3Span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
      4160,
    );
  });
});
