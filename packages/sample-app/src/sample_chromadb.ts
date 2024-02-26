import * as traceloop from "@traceloop/node-server-sdk";
import {
  ChromaClient,
  Collection,
  OpenAIEmbeddingFunction,
  // DeleteCollectionParams,
} from "chromadb";

const client = new ChromaClient();

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY ?? "",
});

traceloop.initialize({
  appName: "sample_chromadb",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

// const sampleAdd = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_add" }, async () => {
//     const addedResponse = await collection.add({
//       ids: ["uri9", "uri10"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style1" }, { style: "style2" }],
//       documents: ["doc1000101", "doc288822"],
//     });

//     console.log(addedResponse);
//   });
// };

// const sampleQuery = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_query" }, async () => {
//     const results = await collection.query({
//       nResults: 2,
//       queryTexts: ["doc1000101"],
//     });

//     console.log(results);
//   });
// };

// const sampleGet = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_get" }, async () => {
//     const result = await collection.get();

//     console.log(result);
//   });
// };

// const sampleModify = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_modify" }, async () => {
//     const result = await collection.modify({
//       name: "my_collection",
//       metadata: { style: "style" },
//     });
//     console.log(result);
//   });
// };

const samplePeek = async (collection: Collection) => {
  return await traceloop.withWorkflow({ name: "sample_peek" }, async () => {
    const result = await collection.peek();
    console.log(result);
  });
};

// const sampleUpdate = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_update" }, async () => {
//     const result = await collection.update({
//       ids: "id1",
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: { source: "my_source" },
//       documents: "This is a document",
//     });
//     console.log(result);
//   });
// };

// const sampleUpsert = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_upsert" }, async () => {
//     const result = await collection.upsert({
//       ids: "id1",
//       metadatas: { source: "my_source" },
//       documents: "This is a document",
//     });
//     console.log(result);
//   });
// };

// const sampleDelete = async (params: DeleteCollectionParams) => {
//   return await traceloop.withWorkflow({ name: "sample_delete" }, async () => {
//     const result = await client.deleteCollection(params);
//     console.log(result);
//   });
// };

traceloop.withAssociationProperties({}, async () => {
  const collection = await client.getCollection({
    name: "my_collection",
    embeddingFunction: embedder,
  });

  // sampleAdd(collection);
  // sampleUpdate(collection);
  // sampleUpsert(collection);
  // sampleQuery(collection);
  samplePeek(collection);
  // sampleModify(collection);
  // sampleDelete({ name: collection.name });
});
