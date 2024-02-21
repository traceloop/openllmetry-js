import * as traceloop from "@traceloop/node-server-sdk";
import { ChromaClient, OpenAIEmbeddingFunction, Collection } from "chromadb";

const client = new ChromaClient();

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY ?? "",
});

traceloop.initialize({
  appName: "sample_chromadb",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const sampleAdd = async (collection: Collection) => {
  const addedResponse = await collection.add({
    ids: ["id1", "id2"],
    metadatas: [{ source: "my_source" }, { source: "my_source" }],
    documents: ["This is a document", "This is another document"],
  });

  console.log(addedResponse);
};

traceloop.withAssociationProperties({}, async () => {
  const collection = await client.createCollection({
    name: "my_collection",
    embeddingFunction: embedder,
  });

  sampleAdd(collection);
});
