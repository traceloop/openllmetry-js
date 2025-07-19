import * as traceloop from "@traceloop/node-server-sdk";
import { VectorStoreIndex, Document, Settings } from "llamaindex";
import { OpenAIEmbedding, OpenAI } from "@llamaindex/openai";
import { readFileSync } from "fs";

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

Settings.embedModel = new OpenAIEmbedding();
Settings.llm = new OpenAI();

class SampleLlamaIndex {
  async query() {
    const text = readFileSync(
      "data/paul_graham/paul_graham_essay.txt",
      "utf-8",
    );
    const document = new Document({ text });

    const index = await VectorStoreIndex.fromDocuments([document]);

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
