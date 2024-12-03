import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

import {
  ContextChatEngine,
  Settings,
  VectorStoreIndex,
  Document,
} from "llamaindex";
import fs from "fs";

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  instrumentModules: {
    openAI: OpenAI,
  },
});

const essay = fs.readFileSync("data/paul_graham/paul_graham_essay.txt").toString();

// Update chunk size
Settings.chunkSize = 512;

async function main() {
  const document = new Document({ text: essay });
  const index = await VectorStoreIndex.fromDocuments([document]);
  const retriever = index.asRetriever({
    similarityTopK: 5,
  });
  const chatEngine = new ContextChatEngine({ retriever });
  const rl = readline.createInterface({ input, output });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = await rl.question("Query: ");
    const stream = await chatEngine.chat({ message: query, stream: true });
    console.log();
    for await (const chunk of stream) {
      process.stdout.write(chunk.response);
    }
  }
}

main().catch(console.error);