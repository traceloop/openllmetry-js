import * as traceloop from "@traceloop/node-server-sdk";
import * as llamaindex from "llamaindex";
import { VectorStoreIndex, Document, Settings } from "llamaindex";
import * as llamaIndexOpenAI from "@llamaindex/openai";
import { OpenAIEmbedding, OpenAI } from "@llamaindex/openai";
import { readFile } from "fs/promises";

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  instrumentModules: {
    llamaIndex: llamaindex,
    llamaIndexOpenAI,
  },
});

Settings.embedModel = new OpenAIEmbedding();
// OpenAI only sends usage in the final streaming chunk if stream_options: { include_usage: true }
Settings.llm = new OpenAI({
  additionalChatOptions: { stream_options: { include_usage: true } },
});

class SampleLlamaIndex {
  async query() {
    const text = await readFile(
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
