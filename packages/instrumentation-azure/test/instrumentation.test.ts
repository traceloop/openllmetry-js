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

import { AzureKeyCredential } from "@azure/openai";
import type * as AzureOpenAIModule from "@azure/openai";

import { AzureOpenAIInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test OpenAI instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: AzureOpenAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let azureOpenAi: AzureOpenAIModule.OpenAIClient;

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
      process.env.AZURE_RESOURCE_NAME = "traceloop-stg";
      process.env.AZURE_API_KEY = "test-key";
      process.env.AZURE_DEPLOYMENT_ID = "openllmetry-testing";
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new AzureOpenAIInstrumentation();
    instrumentation.setTracerProvider(provider);

    const azureOpenAIModule: typeof AzureOpenAIModule = await import(
      "@azure/openai"
    );
    azureOpenAi = new azureOpenAIModule.OpenAIClient(
      `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/`,
      new AzureKeyCredential(process.env.AZURE_API_KEY!),
    );
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "api-key",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for chat", async () => {
    const result = await azureOpenAi.getChatCompletions(
      process.env.AZURE_DEPLOYMENT_ID!,
      [{ role: "user", content: "Tell me a joke about OpenTelemetry" }],
    );

    const spans = memoryExporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });
});
