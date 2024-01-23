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

const memoryExporter = new InMemorySpanExporter();
const pc = new Pinecone();

describe("Test LlamaIndex instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: PineconeInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let pc_index: Index;

  before(async () => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new PineconeInstrumentation();
    instrumentation.setTracerProvider(provider);
    await pc.createIndex({
      name: 'tests',
      dimension: 8,
      metric: 'euclidean',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-west-2'
        }
      }
    });
    pc_index = pc.index("tests");
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    await pc_index.deleteAll();
    await pc_index.namespace("ns1").upsert([
      {
        "id": "vec1",
        "values": [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
      },
      {
        "id": "vec2",
        "values": [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]
      },
      {
        "id": "vec3",
        "values": [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]
      },
      {
        "id": "vec4",
        "values": [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]
      }
    ]);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  after(() => {
    pc.deleteIndex("tests");
  })

  it("should set attributes in span for DB upsert", async () => {
    const input = [
      {
        "id": "vec5",
        "values": [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
      }
    ];
    await pc_index.upsert(input);

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, "upsert");

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes["llm.vector_db_name"], "Pinecone");
  });

  it("should set attributes in span for DB query", async () => {
    await pc_index.namespace("ns1").query({
        topK: 1,
        vector: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
        includeValues: true
    });

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, "query");

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes["llm.vector_db_name"], "Pinecone");
  });

  it("should set attributes in span for DB deletes", async () => {
    await pc_index.deleteOne('vec1');
    await pc_index.deleteMany(['vec2', 'vec3']);
    await pc_index.deleteAll();

    const spans = memoryExporter.getFinishedSpans();

    assert.strictEqual(spans.length, 3);

    for (let index = 0; index < spans.length; index++) {
      const span = spans[index];
      assert.strictEqual(span.name, "delete");
      const attributes = span.attributes;
      assert.strictEqual(attributes["llm.vector_db_name"], "Pinecone");
    }

  }).timeout(60000);
});
