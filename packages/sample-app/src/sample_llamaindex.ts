import * as traceloop from "@traceloop/node-server-sdk";
import {
  OpenAIEmbedding,
  SimpleDirectoryReader,
  SimpleVectorStore,
  VectorStoreIndex,
  serviceContextFromDefaults,
  storageContextFromDefaults,
} from "llamaindex";

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const embedModel = new OpenAIEmbedding();

const vectorStore = new SimpleVectorStore();

class SampleLlamaIndex {
  async query() {
    const documents = await new SimpleDirectoryReader().loadData({
      directoryPath: "data/paul_graham",
    });

    const serviceContext = serviceContextFromDefaults({ embedModel });
    const storageContext = await storageContextFromDefaults({ vectorStore });

    const index = await VectorStoreIndex.fromDocuments(documents, {
      storageContext,
      serviceContext,
    });

    const queryEngine = index.asQueryEngine();

    const res = await queryEngine.query({
      query: "What did the author do growing up?",
      stream: true,
    });
    return res;
  }
}

traceloop.withAssociationProperties(
  { user_id: "12345", chat_id: "789" },
  async () => {
    const sampleLlamaIndex = new SampleLlamaIndex();
    const res = await sampleLlamaIndex.query();
    for await (const result of res) {
      process.stdout.write(result.response);
    }
    //console.log(result.response);
  },
);
