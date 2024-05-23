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
import * as qdrant from "@qdrant/js-client-rest";

const COLLECTION_NAME = "some_collection";

const memoryExporter = new InMemorySpanExporter();

describe("Test Qdrant instrumentation", function () {
  const provider = new BasicTracerProvider();
  let instrumentation: QdrantInstrumentation;
  let contextManager: AsyncHooksContextManager;
  const qdrantClient: qdrant.QdrantClient = new qdrant.QdrantClient({ url: 'http://127.0.0.1:6333' });

  before(async () => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new QdrantInstrumentation({ traceContent: true });
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument(qdrant);
  });

  beforeEach(async function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    memoryExporter.reset();


    qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 3,
        distance: "Cosine",
      }
    })
  });

  afterEach(async () => {
    await qdrantClient.deleteCollection(COLLECTION_NAME);
    memoryExporter.reset();
    context.disable();
  });


  it("should set span attributes for Upsert", async () => {
    const points =
    {
      batch: {
        ids: [32, 23],
        vectors: [
          [1.5, 2.9, 3.4],
          [9.8, 2.3, 2.9],
        ],
        payloads: [{ style: "style3" }, { style: "style4" }],
      }
    };

    qdrantClient.upsert(COLLECTION_NAME, points);

    const spans = memoryExporter.getFinishedSpans();

    // const attributes = spans[0].attributes;

    // assert.strictEqual(
    //   attributes["db.qdrant.upsert.points_count"],
    //   JSON.stringify(points.batch.ids.length),
    // );
  });

});
