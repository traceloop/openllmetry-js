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

import type * as pineconeModuleType from "@pinecone-database/pinecone";
import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { PineconeInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

const PINECONE_TEST_INDEX = "pincone-instrumentation-test";

Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Pinecone instrumentation", function () {
  const provider = new BasicTracerProvider();
  let pineconeModule: typeof pineconeModuleType;
  let instrumentation: PineconeInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let pc: pineconeModuleType.Pinecone;
  let pc_index: pineconeModuleType.Index;

  setupPolly({
    adapters: ["fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
    },
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.PINECONE_API_KEY = "test";
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new PineconeInstrumentation();
    instrumentation.setTracerProvider(provider);

    pineconeModule = await import("@pinecone-database/pinecone");

    pc = new pineconeModule.Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "",
    });

    pc_index = pc.index(PINECONE_TEST_INDEX);
    if (process.env.RECORD_MODE == "NEW") {
      await pc.createIndex({
        name: PINECONE_TEST_INDEX,
        dimension: 8,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1",
          },
        },
      });

      const pc_index = pc.index(PINECONE_TEST_INDEX);

      await pc_index.namespace("ns1").upsert([
        {
          id: "vec1",
          values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
        },
        {
          id: "vec2",
          values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
        },
        {
          id: "vec3",
          values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
          metadata: {
            test_meta: 42,
          },
        },
        {
          id: "vec4",
          values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
        },
      ]);

      // delay before your upserted vectors are available to query ,delete
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });

  beforeEach(async function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;

    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "api-key",
      );
    });

    pc = new pineconeModule.Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "",
    });
    pc_index = pc.index(PINECONE_TEST_INDEX);
    await pc.listIndexes();
    await pc.describeIndex(PINECONE_TEST_INDEX);

    memoryExporter.reset();
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  after(async () => {
    if (process.env.RECORD_MODE == "NEW") pc.deleteIndex(PINECONE_TEST_INDEX);
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
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Pinecone");
  });

  it("should set attributes in span for DB query", async () => {
    await pc_index.namespace("ns1").query({
      topK: 3,
      vector: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      includeValues: true,
      includeMetadata: true,
    });

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Pinecone");

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
  });

  it("should set attributes in span for DB deletes", async () => {
    await pc_index.namespace("ns1").deleteOne("vec1");
    await pc_index.namespace("ns1").deleteMany(["vec2", "vec3"]);
    await pc_index.namespace("ns1").deleteAll();

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 3);

    for (let index = 0; index < spans.length; index++) {
      const span = spans[index];
      assert.strictEqual(span.name, "pinecone.delete");
      const attributes = span.attributes;
      assert.strictEqual(
        attributes[SpanAttributes.VECTOR_DB_VENDOR],
        "Pinecone",
      );
    }
  });
});
