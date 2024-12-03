import * as traceloop from "@traceloop/node-server-sdk";
import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";

const client = new ChromaClient();

traceloop.initialize({
  appName: "sample_chromadb",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const embeddingFunction = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY ?? "",
});
  
traceloop.withAssociationProperties({}, async () => {
  const collection = await client.getOrCreateCollection({
    name: "my_collection",
    embeddingFunction,
  });

  await traceloop.withWorkflow({ name: "sample_query" }, async () => {
    const results = await collection.query({
      nResults: 2,
      queryEmbeddings: [
        [1.1, 2.3, 3.2],
        [5.1, 4.3, 2.2],
      ],
      where: { style: "style2" },
    });

    console.log(results);
  });
});
