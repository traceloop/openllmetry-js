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

import type { GoogleGenAI as GoogleGenAIType } from "@google/genai";

import { GoogleGenAIInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import FetchAdapter from "@pollyjs/adapter-fetch";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
} from "@opentelemetry/semantic-conventions/incubating";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Google GenAI instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: GoogleGenAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let client: GoogleGenAIType;

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
      process.env.GOOGLE_API_KEY = "test-key";
    }
    instrumentation = new GoogleGenAIInstrumentation();
    instrumentation.setTracerProvider(provider);

    const { GoogleGenAI } = await import("@google/genai");
    client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "x-goog-api-key",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for generateContent", async () => {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Tell me a joke about OpenTelemetry",
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(response);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_PROVIDER_NAME}`],
      "gcp.gemini",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_OPERATION_NAME}`],
      "chat",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_REQUEST_MODEL}`],
      "gemini-2.0-flash",
    );

    const inputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_INPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "Tell me a joke about OpenTelemetry",
    );

    const outputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_OUTPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");
    assert.ok(Array.isArray(outputMessages[0].parts));
  }).timeout(30000);

  it("should set attributes in span for generateContent with config", async () => {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: "What is 2+2?" }],
        },
      ],
      config: {
        maxOutputTokens: 100,
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        systemInstruction: "You are a helpful math tutor.",
      },
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(response);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_REQUEST_MAX_TOKENS}`],
      100,
    );

    const systemInstructions = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_SYSTEM_INSTRUCTIONS}`] as string,
    );
    assert.strictEqual(systemInstructions[0].type, "text");
    assert.strictEqual(
      systemInstructions[0].content,
      "You are a helpful math tutor.",
    );

    const inputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_INPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(inputMessages[0].parts[0].content, "What is 2+2?");
  }).timeout(30000);

  it("should set attributes in span for generateContentStream", async () => {
    const stream = await client.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: "Tell me a short joke",
    });

    // Consume the stream
    let text = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        text += chunk.text;
      }
    }

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(text.length > 0);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_REQUEST_MODEL}`],
      "gemini-2.0-flash",
    );

    const inputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_INPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "Tell me a short joke",
    );

    const outputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_OUTPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(outputMessages[0].role, "assistant");
    assert.ok(Array.isArray(outputMessages[0].parts));
  }).timeout(30000);

  it("should set token usage attributes", async () => {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Say hello",
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(response);
    assert.ok(chatSpan);

    const inputTokens =
      chatSpan.attributes[`${ATTR_GEN_AI_USAGE_INPUT_TOKENS}`];
    const outputTokens =
      chatSpan.attributes[`${ATTR_GEN_AI_USAGE_OUTPUT_TOKENS}`];
    const totalTokens =
      chatSpan.attributes[`${SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS}`];

    assert.ok(inputTokens !== undefined && +inputTokens > 0);
    assert.ok(outputTokens !== undefined && +outputTokens > 0);
    assert.ok(totalTokens !== undefined && +totalTokens > 0);
  }).timeout(30000);

  it("should set finish_reasons attribute", async () => {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hi",
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(response);
    assert.ok(chatSpan);

    const finishReasons =
      chatSpan.attributes[`${ATTR_GEN_AI_RESPONSE_FINISH_REASONS}`];
    assert.ok(
      Array.isArray(finishReasons),
      "finish_reasons should be an array",
    );
    assert.ok(finishReasons.length > 0, "finish_reasons should not be empty");
  }).timeout(30000);

  it("should handle multi-turn conversation", async () => {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        { role: "user", parts: [{ text: "My name is Alice" }] },
        {
          role: "model",
          parts: [{ text: "Hello Alice, nice to meet you!" }],
        },
        { role: "user", parts: [{ text: "What is my name?" }] },
      ],
    });

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find(
      (span) => span.name === "chat gemini-2.0-flash",
    );

    assert.ok(response);
    assert.ok(chatSpan);

    const inputMessages = JSON.parse(
      chatSpan.attributes[`${ATTR_GEN_AI_INPUT_MESSAGES}`] as string,
    );
    assert.strictEqual(inputMessages.length, 3);
    assert.strictEqual(inputMessages[0].role, "user");
    assert.strictEqual(inputMessages[1].role, "assistant");
    assert.strictEqual(inputMessages[2].role, "user");
  }).timeout(30000);
});
