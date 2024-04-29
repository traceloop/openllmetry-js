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
    matchRequestsBy: {
      headers: false,
    },
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
    const res = await openai.chat({
      messages: [{ role: "user", content: prompt }],
    });

    assert.ok(res);
    assert.ok(res.message);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    const chatAttributes = spans[0].attributes;

    assert.strictEqual(chatAttributes["gen_ai.system"], "OpenAI");
    assert.strictEqual(chatAttributes["llm.request.type"], "chat");
    assert.strictEqual(chatAttributes["gen_ai.request.model"], model);
    assert.strictEqual(chatAttributes["gen_ai.request.top_p"], 1);
    assert.strictEqual(chatAttributes["gen_ai.prompt.0.content"], prompt);
    assert.strictEqual(chatAttributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(chatAttributes["gen_ai.completion.0.role"], "assistant");
    assert.strictEqual(
      chatAttributes["gen_ai.completion.0.content"],
      res.message.content,
    );
  });

  it("should set attributes in span for LLM instrumentation in case of streaming response", async () => {
    const model = "gpt-3.5-turbo";
    const prompt = "Tell me a joke about OpenTelemetry";
    const openai = new llamaindex.OpenAI({ model, temperature: 0 });
    const res = await openai.chat({
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    assert.ok(res);
    let message = "";
    for await (const messageChunk of res) {
      if (messageChunk.delta) {
        message += messageChunk.delta;
      }
    }
    assert.ok(message);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    const chatAttributes = spans[0].attributes;

    assert.strictEqual(chatAttributes["gen_ai.system"], "OpenAI");
    assert.strictEqual(chatAttributes["llm.request.type"], "chat");
    assert.strictEqual(chatAttributes["gen_ai.request.model"], model);
    assert.strictEqual(chatAttributes["gen_ai.request.top_p"], 1);
    assert.strictEqual(chatAttributes["gen_ai.prompt.0.content"], prompt);
    assert.strictEqual(chatAttributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(chatAttributes["gen_ai.completion.0.content"], message);
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

    const result = await queryEngine.query({
      query: "Where was albert einstein born?",
    });

    assert.ok(result.response);

    const spans = memoryExporter.getFinishedSpans();

    const spanNames = spans.map((span) => span.name);

    // TODO: Need to figure out why this doesn't get logged
    // assert.ok(spanNames.includes("get_query_embedding.task"));

    const retrieverQueryEngineSpan = spans.find(
      (span) => span.name === "retriever_query_engine.query",
    );

    assert.ok(spanNames.includes("retriever_query_engine.retrieve"));
    assert.ok(spanNames.includes("llamaindex.open_ai.chat"));
    assert.ok(spanNames.includes("response_synthesizer.synthesize"));
    assert.ok(spanNames.includes("vector_index_retriever.retrieve"));

    assert.ok(retrieverQueryEngineSpan);
    assert.ok(retrieverQueryEngineSpan.attributes["traceloop.entity.input"]);
    assert.ok(retrieverQueryEngineSpan.attributes["traceloop.entity.output"]);
    assert.strictEqual(
      JSON.parse(
        retrieverQueryEngineSpan.attributes[
          "traceloop.entity.input"
        ].toString(),
      ).kwargs.query,
      "Where was albert einstein born?",
    );
    assert.strictEqual(
      JSON.parse(
        retrieverQueryEngineSpan.attributes[
          "traceloop.entity.output"
        ].toString(),
      ).response,
      result.response,
    );
  }).timeout(60000);

  it("should build proper trace on streaming query engine", async () => {
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

    const result = await queryEngine.query({
      query: "Where was albert einstein born?",
      stream: true,
    });

    for await (const res of result) {
      assert.ok(res);
    }

    const spans = memoryExporter.getFinishedSpans();

    // TODO: Need to figure out why this doesn't get logged
    // assert.ok(spanNames.includes("get_query_embedding.task"));

    const retrieverQueryEngineSpan = spans.find(
      (span) => span.name === "retriever_query_engine.query",
    );
    const synthesizeSpan = spans.find(
      (span) => span.name === "response_synthesizer.synthesize",
    );
    const openAIChatSpan = spans.find(
      (span) => span.name === "llamaindex.open_ai.chat",
    );

    assert.strictEqual(
      synthesizeSpan?.parentSpanId,
      retrieverQueryEngineSpan?.spanContext().spanId,
    );
    assert.strictEqual(
      openAIChatSpan?.parentSpanId,
      synthesizeSpan?.spanContext().spanId,
    );
  }).timeout(60000);
});
