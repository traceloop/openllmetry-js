/* Adapted from Langchain.js docs: https://js.langchain.com/docs/modules/chains/popular/vector_db_qa/ */
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import * as fs from "fs";
// import {
//   RunnablePassthrough,
//   RunnableSequence,
// } from "langchain/schema/runnable";
import { RetrievalQAChain } from "langchain/chains";
// import { StringOutputParser } from "langchain/schema/output_parser";
// import {
//   ChatPromptTemplate,
//   HumanMessagePromptTemplate,
//   SystemMessagePromptTemplate,
// } from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models/openai";
// import { formatDocumentsAsString } from "langchain/util/document";
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "sample_langchain",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const run = async () => {
  // Initialize the LLM to use to answer the question.
  const model = new ChatOpenAI({});
  const text = fs.readFileSync("../../data/state_of_the_union.txt", "utf8");
  const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
  const docs = await textSplitter.createDocuments([text]);
  // Create a vector store from the documents.
  const vectorStore = await HNSWLib.fromDocuments(docs, new OpenAIEmbeddings());

  // Initialize a retriever wrapper around the vector store
  const vectorStoreRetriever = vectorStore.asRetriever();

  // Create a system & human prompt for the chat model
  //   const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
  // If you don't know the answer, just say that you don't know, don't try to make up an answer.
  // ----------------
  // {context}`;
  //   const messages = [
  //     SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
  //     HumanMessagePromptTemplate.fromTemplate("{question}"),
  //   ];
  //   const prompt = ChatPromptTemplate.fromMessages(messages);

  const chain = RetrievalQAChain.fromLLM(model, vectorStoreRetriever);
  const answer = await chain.call({
    query: "What did the president say about Justice Breyer?",
  });
  //   const chain = RunnableSequence.from([
  //     {
  //       context: vectorStoreRetriever.pipe(formatDocumentsAsString),
  //       question: new RunnablePassthrough(),
  //     },
  //     prompt,
  //     model,
  //     new StringOutputParser(),
  //   ]);

  //   const answer = await chain.invoke(
  //     "What did the president say about Justice Breyer?",
  //   );

  console.log({ answer });
};

run();
