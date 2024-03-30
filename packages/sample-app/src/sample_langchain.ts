import * as fs from "fs";

import * as traceloop from "@traceloop/node-server-sdk";
import { TraceloopCallbackHandler } from "@traceloop/instrumentation-langchain";

import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains";
import { PromptTemplate } from "@langchain/core/prompts";
import { OllamaEmbeddings } from "langchain/embeddings/ollama";
import { Ollama } from "@langchain/community/llms/ollama";
// import * as ChainsModule from "langchain/chains";

import { DiagConsoleLogger, ProxyTracerProvider } from "@opentelemetry/api";

traceloop.initialize({
  appName: "sample_langchain",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  logLevel: 'debug',
  /*instrumentModules: { langchain: { chainsModule: ChainsModule } },
  traceContent: true,*/
});

class SampleLangchain {
  @traceloop.workflow({ name: "sample_qa_stuff_chain" })
  async qaStuffChainExample() {
    const slowerModel = new Ollama({
      baseUrl: "http://localhost:11434",
      model: "llama2",
    });
    const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say that you don't know, don't try to make up an answer.
    ----------------
    {context}`;
    const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
    const text = fs.readFileSync(
      "data/paul_graham/paul_graham_essay.txt",
      "utf8",
    );
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const docs = await textSplitter.createDocuments([text]);
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OllamaEmbeddings({
        baseUrl: "http://localhost:11434",
        model: "llama2",
      }),
    );
    const chain = new RetrievalQAChain({
      combineDocumentsChain: loadQAStuffChain(slowerModel, { prompt }),
      retriever: vectorStore.asRetriever(2),
      returnSourceDocuments: true,
      callbacks: [
        new TraceloopCallbackHandler({
          tracer: new ProxyTracerProvider().getTracer("@traceloop/instrumentation-langchain", "0.5.24"),
          logger: new DiagConsoleLogger(),
          shouldSendPrompts: true,
        }),
      ],
    });
    const result = await chain.call({
      query: "What did the author do growing up?",
      k: 8,
    });
    return result;
  }
}

traceloop.withAssociationProperties(
  { user_id: "12345", chat_id: "789" },
  async () => {
    const sampleLangchain = new SampleLangchain();
    const retrievalQAChainResult =
      await sampleLangchain.qaStuffChainExample();
    console.log(retrievalQAChainResult);
  },
);
