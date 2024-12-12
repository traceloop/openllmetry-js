// /*
//  * Copyright Traceloop
//  *
//  * Licensed under the Apache License, Version 2.0 (the "License");
//  * you may not use this file except in compliance with the License.
//  * You may obtain a copy of the License at
//  *
//  *      https://www.apache.org/licenses/LICENSE-2.0
//  *
//  * Unless required by applicable law or agreed to in writing, software
//  * distributed under the License is distributed on an "AS IS" BASIS,
//  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  * See the License for the specific language governing permissions and
//  * limitations under the License.
//  */

// import { context } from "@opentelemetry/api";
// import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
// import { ChromaDBInstrumentation } from "../src/instrumentation";
// import { EventAttributes, Events } from "@traceloop/ai-semantic-conventions";
// import {
//   BasicTracerProvider,
//   InMemorySpanExporter,
//   SimpleSpanProcessor,
// } from "@opentelemetry/sdk-trace-base";
// import * as chromadb from "chromadb";
// import * as assert from "assert";

// const memoryExporter = new InMemorySpanExporter();

// describe("Test ChromaDB instrumentation", function () {
//   const provider = new BasicTracerProvider();
//   let instrumentation: ChromaDBInstrumentation;
//   let contextManager: AsyncHooksContextManager;
//   let chromaDbClient: chromadb.ChromaClient;
//   let collection: chromadb.Collection;

//   this.beforeAll(async () => {
//     chromaDbClient = new chromadb.ChromaClient();

//     // Wait for ChromaDB to spin up
//     await new Promise((resolve) => {
//       setTimeout(resolve, 3000);
//     });
//   });

//   before(async () => {
//     provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
//     instrumentation = new ChromaDBInstrumentation({ traceContent: true });
//     instrumentation.setTracerProvider(provider);
//     instrumentation.manuallyInstrument(chromadb);
//   });

//   beforeEach(async function () {
//     contextManager = new AsyncHooksContextManager().enable();
//     context.setGlobalContextManager(contextManager);
//     memoryExporter.reset();

//     const embeddingFunction = new chromadb.OpenAIEmbeddingFunction({
//       openai_api_key: process.env.OPENAI_API_KEY ?? "",
//     });

//     // Create Collection before each test case
//     collection = await chromaDbClient.getOrCreateCollection({
//       name: "my_collection",
//       embeddingFunction,
//     });

//     // Add sample data to the collection before each test case
//     await collection.add({
//       ids: ["uri9", "uri10"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style1" }, { style: "style2" }],
//       documents: ["doc1000101", "doc288822"],
//     });
//   });

//   afterEach(async () => {
//     // Delete Collection after every test completion
//     await chromaDbClient.deleteCollection({ name: "my_collection" });
//     memoryExporter.reset();
//     context.disable();
//   });

//   it("should set span attributes for Query", async () => {
//     const input: chromadb.QueryParams = {
//       nResults: 2,
//       queryEmbeddings: [
//         [1.1, 2.3, 3.2],
//         [5.1, 4.3, 2.2],
//       ],
//       where: { style: "style2" },
//     };
//     const result = await collection.query(input);

//     const output: any = [];
//     for (let index = 0; index < result.ids.length; index++) {
//       output.push({
//         [EventAttributes.DB_QUERY_RESULT_ID]: result.ids?.[index] ?? [],
//         [EventAttributes.DB_QUERY_RESULT_DISTANCE]:
//           result.distances?.[index] ?? [],
//         [EventAttributes.DB_QUERY_RESULT_METADATA]:
//           result.metadatas?.[index] ?? [],
//         [EventAttributes.DB_QUERY_RESULT_DOCUMENT]:
//           result.documents?.[index] ?? [],
//         [EventAttributes.DB_QUERY_RESULT_VECTOR]:
//           result.embeddings?.[index] ?? [],
//       });
//     }

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert input attributes
//     assert.strictEqual(
//       attributes["db.chroma.query.query_embeddings_count"],
//       JSON.stringify(input.queryEmbeddings?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.query.query_texts_count"],
//       JSON.stringify(input.queryTexts?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.query.n_results"],
//       JSON.stringify(input?.nResults),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.query.where"],
//       JSON.stringify(input?.where),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.query.where_document"],
//       JSON.stringify(input?.whereDocument),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.query.include"],
//       JSON.stringify(input?.include),
//     );

//     const events = spans[1].events;
//     const outputAttributes = events.map((event) => event.attributes);

//     // Assert output event attributes names
//     outputAttributes.forEach((each, index) => {
//       assert.equal(
//         each?.[EventAttributes.DB_QUERY_RESULT_ID],
//         JSON.stringify(output[index]?.[EventAttributes.DB_QUERY_RESULT_ID]),
//       );

//       assert.equal(
//         each?.[EventAttributes.DB_QUERY_RESULT_DOCUMENT],
//         JSON.stringify(
//           output[index]?.[EventAttributes.DB_QUERY_RESULT_DOCUMENT],
//         ),
//       );

//       assert.equal(
//         each?.[EventAttributes.DB_QUERY_RESULT_METADATA],
//         JSON.stringify(
//           output[index]?.[EventAttributes.DB_QUERY_RESULT_METADATA],
//         ),
//       );

//       assert.equal(
//         each?.[EventAttributes.DB_QUERY_RESULT_DISTANCE],
//         JSON.stringify(
//           output[index]?.[EventAttributes.DB_QUERY_RESULT_DISTANCE],
//         ),
//       );

//       assert.equal(
//         each?.[EventAttributes.DB_QUERY_RESULT_VECTOR],
//         JSON.stringify(output[index]?.[EventAttributes.DB_QUERY_RESULT_VECTOR]),
//       );
//     });
//   });

//   it("should set span attributes for Add", async () => {
//     const input: chromadb.AddParams = {
//       ids: ["uri7", "uri8"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style3" }, { style: "style4" }],
//       documents: ["doc0", "doc1"],
//     };
//     await collection.add(input);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert input attributes
//     assert.strictEqual(
//       attributes["db.chroma.add.ids_count"],
//       JSON.stringify(input?.ids?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.add.embeddings_count"],
//       JSON.stringify(input?.embeddings?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.add.metadatas_count"],
//       JSON.stringify(input?.metadatas?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.add.documents_count"],
//       JSON.stringify(input?.documents?.length),
//     );

//     // Cleanup created collection at the end
//     collection.delete({ ids: ["uri7", "uri8"] });
//   });

//   it("should set span attributes for Get", async () => {
//     const input: chromadb.GetParams = {
//       ids: ["uri9", "uri10"],
//     };
//     await collection.get(input);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans.reduce((span, current) => {
//       Object.keys(current.attributes).forEach((key) => {
//         span[key] = current.attributes[key];
//       });
//       return span;
//     }, {});

//     // Assert input attributes
//     assert.strictEqual(
//       attributes["db.chroma.get.ids_count"],
//       JSON.stringify(input.ids?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.get.where"],
//       JSON.stringify(input.where),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.get.limit"],
//       JSON.stringify(input.limit),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.get.offset"],
//       JSON.stringify(input.offset),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.get.where_document"],
//       JSON.stringify(input?.whereDocument),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.get.include"],
//       JSON.stringify(input?.include),
//     );
//   });

//   it("should set span attributes for Delete", async () => {
//     const input: chromadb.DeleteParams = {
//       ids: ["uri9", "uri10"],
//     };
//     await collection.delete(input);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert input attributes
//     assert.strictEqual(
//       attributes["db.chroma.delete.ids_count"],
//       JSON.stringify(input.ids?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.delete.where"],
//       JSON.stringify(input.where),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.delete.where_document"],
//       JSON.stringify(input.whereDocument),
//     );
//   });

//   it("should set span attributes for Update", async () => {
//     // Input params that is created at beforeEach
//     const input: chromadb.AddParams = {
//       ids: ["uri9", "uri10"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style1" }, { style: "style2" }],
//       documents: ["doc1000101", "doc288822"],
//     };
//     const updatedInput = {
//       ...input,
//       embeddings: [
//         [1.3, 2.3, 3.8],
//         [9.2, 2.2, 1.9],
//       ],
//     };
//     await collection.update(updatedInput);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert updated input attributes
//     assert.strictEqual(
//       attributes["db.chroma.update.ids_count"],
//       JSON.stringify(updatedInput?.ids?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.update.embeddings_count"],
//       JSON.stringify(updatedInput?.embeddings?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.update.metadatas_count"],
//       JSON.stringify(updatedInput?.metadatas?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.update.documents_count"],
//       JSON.stringify(updatedInput?.documents?.length),
//     );
//   });

//   it("should set span attributes for Peek", async () => {
//     const input: chromadb.PeekParams = {};
//     await collection.peek(input);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert input attributes
//     assert.strictEqual(
//       attributes["db.chroma.peek.limit"],
//       JSON.stringify(input?.limit),
//     );
//   });

//   it("should set span attributes for Upsert", async () => {
//     const input: chromadb.AddParams = {
//       ids: ["uri7", "uri8"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style3" }, { style: "style4" }],
//       documents: ["doc0", "doc1"],
//     };
//     await collection.upsert(input);

//     const updatedInput = {
//       ...input,
//       embeddings: [
//         [1.3, 2.3, 3.8],
//         [9.2, 2.2, 1.9],
//       ],
//     };
//     await collection.update(updatedInput);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans[1].attributes;

//     // Assert updated input attributes
//     assert.strictEqual(
//       attributes["db.chroma.upsert.ids_count"],
//       JSON.stringify(updatedInput?.ids?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.upsert.embeddings_count"],
//       JSON.stringify(updatedInput?.embeddings?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.upsert.metadatas_count"],
//       JSON.stringify(updatedInput?.metadatas?.length),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.upsert.documents_count"],
//       JSON.stringify(updatedInput?.documents?.length),
//     );

//     // Cleanup created collection at the end
//     collection.delete({ ids: ["uri7", "uri8"] });
//   });

//   it("should set span attributes for Modify", async () => {
//     const input: chromadb.ModifyCollectionParams = {
//       name: "my_collection",
//       metadata: { style: "style" },
//     };
//     await collection.modify(input);

//     const spans = memoryExporter.getFinishedSpans();
//     const attributes = spans.reduce((span, current) => {
//       Object.keys(current.attributes).forEach((key) => {
//         span[key] = current.attributes[key];
//       });
//       return span;
//     }, {});

//     // Assert updated input attributes
//     assert.strictEqual(
//       attributes["db.chroma.modify.name"],
//       JSON.stringify(input?.name),
//     );
//     assert.strictEqual(
//       attributes["db.chroma.modify.metadata"],
//       JSON.stringify(input?.metadata),
//     );
//   });
// });
