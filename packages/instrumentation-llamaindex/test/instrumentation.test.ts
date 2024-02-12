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

import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { LlamaIndexInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type * as llamaindexImport from "llamaindex";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test LlamaIndex instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: LlamaIndexInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let llamaindex: typeof llamaindexImport;

  setupPolly({
    adapters: ["node-http"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
  });

  before(() => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new LlamaIndexInstrumentation();
    instrumentation.setTracerProvider(provider);
    llamaindex = require("llamaindex");
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

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for LLM instrumentation", async () => {
    const model = "gpt-3.5-turbo";
    const prompt = "Tell me a joke about OpenTelemetry";
    const openai = new llamaindex.OpenAI({ model, temperature: 0 });
    const res = await openai.complete(prompt);

    assert.ok(res);
    assert.ok(res.message);
    assert.ok(res.message.role);
    assert.ok(res.message.content);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 2);
    const chatAttributes = spans[0].attributes;
    const completionAttributes = spans[1].attributes;

    assert.strictEqual(chatAttributes["llm.vendor"], "OpenAI2");
    assert.strictEqual(chatAttributes["llm.request.type"], "chat");
    assert.strictEqual(chatAttributes["llm.request.model"], model);
    assert.strictEqual(chatAttributes["llm.top_p"], 1);
    assert.strictEqual(chatAttributes["llm.prompts.0.content"], prompt);
    assert.strictEqual(chatAttributes["llm.prompts.0.role"], "user");
    assert.strictEqual(completionAttributes["llm.response.model"], model);
    assert.strictEqual(chatAttributes["llm.completions.0.role"], "assistant");
    assert.ok(chatAttributes["llm.completions.0.content"]);

    assert.strictEqual(completionAttributes["llm.vendor"], "OpenAI2");
    assert.strictEqual(
      completionAttributes["llm.request.type"],
      "llm.completions",
    );
    assert.strictEqual(completionAttributes["llm.request.model"], model);
    assert.strictEqual(completionAttributes["llm.top_p"], 1);
    assert.strictEqual(completionAttributes["llm.prompts.0.content"], prompt);
    assert.strictEqual(completionAttributes["llm.response.model"], model);
    assert.strictEqual(
      completionAttributes["llm.completions.0.role"],
      "assistant",
    );
    assert.ok(completionAttributes["llm.completions.0.content"]);
  });

  it("should set attributes in span for LLM instrumentation in case of streaming response", async () => {
    const model = "gpt-3.5-turbo";
    const prompt = "Tell me a joke about OpenTelemetry";
    const openai = new llamaindex.OpenAI({ model, temperature: 0 });
    const res = await openai.complete(prompt, undefined, true);

    assert.ok(res);
    let message = "";
    for await (const messageChunk of res) {
      message += messageChunk;
    }
    assert.ok(message);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 2);
    const chatAttributes = spans[0].attributes;
    const completionAttributes = spans[1].attributes;

    assert.strictEqual(chatAttributes["llm.vendor"], "OpenAI2");
    assert.strictEqual(chatAttributes["llm.request.type"], "chat");
    assert.strictEqual(chatAttributes["llm.request.model"], model);
    assert.strictEqual(chatAttributes["llm.top_p"], 1);
    assert.strictEqual(chatAttributes["llm.prompts.0.content"], prompt);
    assert.strictEqual(chatAttributes["llm.prompts.0.role"], "user");
    assert.strictEqual(completionAttributes["llm.response.model"], model);
    assert.ok(chatAttributes["llm.completions.0.content"]);

    assert.strictEqual(completionAttributes["llm.vendor"], "OpenAI2");
    assert.strictEqual(
      completionAttributes["llm.request.type"],
      "llm.completions",
    );
    assert.strictEqual(completionAttributes["llm.request.model"], model);
    assert.strictEqual(completionAttributes["llm.top_p"], 1);
    assert.strictEqual(completionAttributes["llm.prompts.0.content"], prompt);
    assert.strictEqual(completionAttributes["llm.response.model"], model);
    assert.ok(completionAttributes["llm.completions.0.content"]);
  });

  it("should add span for all instrumented methods", async () => {
    const directoryReader = new llamaindex.SimpleDirectoryReader();
    const documents = await directoryReader.loadData({ directoryPath: "test" });
    const embedModel = new llamaindex.OpenAIEmbedding();
    const vectorStore = new llamaindex.SimpleVectorStore();

    const serviceContext = llamaindex.serviceContextFromDefaults({
      embedModel,
    });
    const storageContext = await llamaindex.storageContextFromDefaults({
      vectorStore,
    });

    const index = await llamaindex.VectorStoreIndex.fromDocuments(documents, {
      storageContext,
      serviceContext,
    });

    const queryEngine = index.asQueryEngine();

    const result = await queryEngine.query("Where was albert einstein born?");

    assert.ok(result.response);

    const spans = memoryExporter.getFinishedSpans();

    const spanNames = spans.map((span) => span.name);

    assert.ok(spanNames.includes("get_query_embedding.task"));

    assert.ok(spanNames.includes("retrieve.task"));
    assert.ok(spanNames.includes("retrieve.task"));
    assert.ok(spanNames.includes("open_ai_2.chat"));
    assert.ok(spanNames.includes("open_ai_2.completion"));
    assert.ok(spanNames.includes("synthesize.task"));
    assert.ok(spanNames.includes("query.task"));
  }).timeout(60000);
});
