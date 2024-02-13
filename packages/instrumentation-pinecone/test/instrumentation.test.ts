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
import { PineconeInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Pinecone, Index } from "@pinecone-database/pinecone";
import * as pc_module from "@pinecone-database/pinecone";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe.skip("Test Pinecone instrumentation", function () {
  const provider = new BasicTracerProvider();
  let instrumentation: PineconeInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let pc_index: Index;

  setupPolly({
    adapters: ["fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.PINECONE_API_KEY = "test";
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new PineconeInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument(pc_module);
    // TODO: create index manually in your Pinecone Instance
    // await pc.createIndex({
    //   name: "tests",
    //   dimension: 8,
    //   metric: "euclidean",
    //   spec: {
    //     serverless: {
    //       cloud: "aws",
    //       region: "us-west-2",
    //     },
    //   },
    // });
    const pc = new Pinecone();
    pc_index = pc.index("tests");
  });

  beforeEach(async function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "api-key",
      );
    });

    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    // await pc_index.namespace("ns1").deleteAll();
    // await pc_index.namespace("ns1").upsert([
    //   {
    //     id: "vec1",
    //     values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    //   },
    //   {
    //     id: "vec2",
    //     values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    //   },
    //   {
    //     id: "vec3",
    //     values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    //     metadata: {
    //       test_meta: 42,
    //     },
    //   },
    //   {
    //     id: "vec4",
    //     values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    //   },
    // ]);
    memoryExporter.reset();
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  after(() => {
    //pc.deleteIndex("tests");
  });

  it("should set attributes in span for DB upsert", async () => {
    const input = [
      {
        id: "vec5",
        values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      },
    ];
    await pc_index.upsert(input);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, "pinecone.upsert");

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes["vector_db.vendor"], "Pinecone");
  }).timeout(60000);

  it("should set attributes in span for DB query", async () => {
    // wait 30 seconds for pinecone to update to go through otherwise result can have 0 values.
    // await new Promise((resolve) => setTimeout(resolve, 30000));

    // now query
    await pc_index.namespace("ns1").query({
      topK: 3,
      vector: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      includeValues: true,
      includeMetadata: true,
    });

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    const attributes = spans[0].attributes;
    assert.strictEqual(attributes["vector_db.vendor"], "Pinecone");

    const span = spans[0];
    assert.strictEqual(span.events.length, 8);
    assert.strictEqual(span.events[0].name, "pinecone.query.request");
    assert.strictEqual(span.events[1].name, "pinecone.query.result");
    assert.strictEqual(span.events[2].name, "pinecone.query.result.0");
    assert.strictEqual(span.events[3].name, "pinecone.query.result.0.metadata");
    assert.strictEqual(span.events[4].name, "pinecone.query.result.1");
    assert.strictEqual(span.events[5].name, "pinecone.query.result.1.metadata");
    assert.strictEqual(span.events[6].name, "pinecone.query.result.2");
    assert.strictEqual(span.events[7].name, "pinecone.query.result.2.metadata");
  }).timeout(60000);

  it.skip("should set attributes in span for DB deletes", async () => {
    await pc_index.deleteOne("vec1");
    await pc_index.deleteMany(["vec2", "vec3"]);
    await pc_index.deleteAll();

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 3);

    for (let index = 0; index < spans.length; index++) {
      const span = spans[index];
      assert.strictEqual(span.name, "pinecone.delete");
      const attributes = span.attributes;
      assert.strictEqual(attributes["vector_db.vendor"], "Pinecone");
    }
  });
});
