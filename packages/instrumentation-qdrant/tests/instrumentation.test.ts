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
import { QdrantInstrumentation } from "../src/instrumentation";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type * as qdrant_types from "@qdrant/js-client-rest";
import * as assert from "assert";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { v4 as uuidv4 } from "uuid";

const COLLECTION_NAME = uuidv4();

const memoryExporter = new InMemorySpanExporter();

describe("Test Qdrant instrumentation", function () {
  const provider = new BasicTracerProvider();
  let instrumentation: QdrantInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let qdrantClient: qdrant_types.QdrantClient;

  before(async () => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new QdrantInstrumentation({ traceContent: true });
    instrumentation.setTracerProvider(provider);

    const qdrant_module = await import("@qdrant/js-client-rest");
    qdrantClient = new qdrant_module.QdrantClient({
      url: "http://127.0.0.1:6333",
    });

    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 3,
        distance: "Cosine",
      },
    });
  });

  beforeEach(async function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    memoryExporter.reset();
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  this.afterAll(async () => {
    await qdrantClient.deleteCollection(COLLECTION_NAME);
  });

  it("should set span attributes for upsert", async () => {
    const points = {
      batch: {
        ids: [32, 23, 42, 24, 25, 26],
        vectors: [
          [1.5, 2.9, 3.4],
          [9.8, 2.3, 2.9],
          [0.3, 0.3, 0.3],
          [1.5, 2.9, 3.4],
          [9.8, 2.3, 2.9],
          [0.3, 0.3, 0.3],
        ],
        payloads: [
          { style: "style3" },
          { style: "style4" },
          { style: "style5" },
          { style: "style6" },
          { style: "style7" },
          { style: "style8" },
        ],
      },
    };

    await qdrantClient.upsert(COLLECTION_NAME, points);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, `qdrant.upsert`);

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Qdrant");
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_TABLE_NAME],
      COLLECTION_NAME,
    );
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_ADD_COUNT],
      points.batch.ids.length,
    );
  });

  it("should set attributes in span for search", async () => {
    await qdrantClient.search(COLLECTION_NAME, {
      vector: [0.3, 0.3, 0.3],
      limit: 3,
      with_payload: true,
      with_vector: true,
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, `qdrant.search`);

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Qdrant");
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_TABLE_NAME],
      COLLECTION_NAME,
    );

    const span = spans[0];
    assert.strictEqual(span.events.length, 5);
    assert.strictEqual(span.events[0].name, "qdrant.search.request");
    assert.strictEqual(span.events[1].name, "qdrant.search.result");
    assert.strictEqual(span.events[2].name, "qdrant.search.result.0");
    assert.strictEqual(span.events[3].name, "qdrant.search.result.1");
    assert.strictEqual(span.events[4].name, "qdrant.search.result.2");
  });

  it("should set span attributes for retrieve", async () => {
    await qdrantClient.retrieve(COLLECTION_NAME, {
      ids: [32, 23, 42],
      with_payload: true,
      with_vector: true,
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, `qdrant.retrieve`);

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Qdrant");
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_TABLE_NAME],
      COLLECTION_NAME,
    );
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_GET_COUNT], 3);
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_GET_INCLUDE_METADATA],
      true,
    );
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_GET_INCLUDE_VALUES],
      true,
    );
  });

  it("should set span attributes for delete", async () => {
    await qdrantClient.delete(COLLECTION_NAME, {
      points: [32, 23, 42, 24, 25, 26],
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, `qdrant.delete`);

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_VENDOR], "Qdrant");
    assert.strictEqual(
      attributes[SpanAttributes.VECTOR_DB_TABLE_NAME],
      COLLECTION_NAME,
    );
    assert.strictEqual(attributes[SpanAttributes.VECTOR_DB_DELETE_COUNT], 6);
  });
});
