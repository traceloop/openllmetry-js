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
    instrumentation = new OpenAIInstrumentation();
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
    assert.strictEqual(completionSpan.attributes["llm.prompts.0.role"], "user");
    assert.strictEqual(
      completionSpan.attributes["llm.prompts.0.content"],
      "Tell me a joke about OpenTelemetry",
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
    assert.strictEqual(completionSpan.attributes["llm.prompts.0.role"], "user");
    assert.strictEqual(
      completionSpan.attributes["llm.prompts.0.content"],
      "Tell me a joke about OpenTelemetry",
    );
  });
});
