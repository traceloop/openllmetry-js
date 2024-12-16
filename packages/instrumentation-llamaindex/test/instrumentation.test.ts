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
      order: false,
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

  it.skip("should add span for all instrumented methods", async () => {
    const directoryReader = new llamaindex.SimpleDirectoryReader();
    const documents = await directoryReader.loadData({
      directoryPath: "test/data",
    });

    const index = await llamaindex.VectorStoreIndex.fromDocuments(documents);
    const queryEngine = index.asQueryEngine();

    const result = await queryEngine.query({
      query: "Where was albert einstein born?",
    });

    assert.ok(result.message);

    const spans = memoryExporter.getFinishedSpans();
    const spanNames = spans.map((span) => span.name);
    const retrieverQueryEngineSpan = spans.find(
      (span) => span.name === "retriever_query_engine.query",
    );

    assert.ok(spanNames.includes("open_ai_embedding.get_query_embedding"));
    assert.ok(spanNames.includes("vector_index_retriever.retrieve"));
    assert.ok(spanNames.includes("retriever_query_engine.retrieve"));
    assert.ok(spanNames.includes("base_synthesizer.synthesize"));
    assert.ok(spanNames.includes("retriever_query_engine.query"));

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
    assert.deepStrictEqual(
      JSON.parse(
        retrieverQueryEngineSpan.attributes[
          "traceloop.entity.output"
        ].toString(),
      ).message,
      result.message,
    );
  }).timeout(60000);

  it.skip("should build proper trace on streaming query engine", async () => {
    const directoryReader = new llamaindex.SimpleDirectoryReader();
    const documents = await directoryReader.loadData({
      directoryPath: "test/data",
    });

    const index = await llamaindex.VectorStoreIndex.fromDocuments(documents);
    const queryEngine = index.asQueryEngine();

    const result = await queryEngine.query({
      query: "Where was albert einstein born?",
      stream: true,
    });

    for await (const res of result) {
      assert.ok(res);
    }

    const spans = memoryExporter.getFinishedSpans();

    const retrieverQueryEngineQuerySpan = spans.find(
      (span) => span.name === "retriever_query_engine.query",
    );
    const synthesizeSpan = spans.find(
      (span) => span.name === "base_synthesizer.synthesize",
    );
    const retrieverQueryEngineRetrieveSpan = spans.find(
      (span) => span.name === "retriever_query_engine.retrieve",
    );
    const openAIEmbeddingSpan = spans.find(
      (span) => span.name === "open_ai_embedding.get_query_embedding",
    );
    const vectorIndexRetrieverSpan = spans.find(
      (span) => span.name === "vector_index_retriever.retrieve",
    );

    assert.strictEqual(
      synthesizeSpan?.parentSpanId,
      retrieverQueryEngineQuerySpan?.spanContext().spanId,
    );

    assert.strictEqual(
      retrieverQueryEngineRetrieveSpan?.parentSpanId,
      retrieverQueryEngineQuerySpan?.spanContext().spanId,
    );

    assert.strictEqual(
      vectorIndexRetrieverSpan?.parentSpanId,
      retrieverQueryEngineRetrieveSpan?.spanContext().spanId,
    );

    assert.strictEqual(
      openAIEmbeddingSpan?.parentSpanId,
      vectorIndexRetrieverSpan?.spanContext().spanId,
    );
  }).timeout(60000);
});
