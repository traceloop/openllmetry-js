import * as traceloop from "@traceloop/node-server-sdk";

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";

import * as RunnableModule from "@langchain/core/runnables";

traceloop.initialize({
  disableBatch: true,
  instrumentModules: {
    langchain: { runnablesModule: RunnableModule },
  },
});

async function main() {
  const llm = new ChatOpenAI({ model: "gpt-4o" });
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-large" });

  const monsters = [
    "Goblin: Weak but numerous, attacks in groups.",
    "Orc: Strong and aggressive, fights head-on.",
    "Skeleton: Undead warrior, immune to poison but fragile.",
    "Giant Spider: Webs players, poisonous bite.",
    "Dragon: Powerful and magical, breathes fire.",
    "Keegorg: Senior Solution Architect at Docker",
  ].map((pageContent) => ({ pageContent, metadata: {} }));

  const vectorStore = new MemoryVectorStore(embeddings);
  // Create embeddings for the monsters
  await vectorStore.addDocuments(monsters);

  // Retrieve only one monster
  const retriever = vectorStore.asRetriever(1);

  // Create prompt template
  const ANSWER_PROMPT = ChatPromptTemplate.fromTemplate(
    `You are a monster expert, and the context includes relevant monsters. Answer the user concisely only using the provided context. If you don't know the answer, just say that you don't know.

        context: {context}
        Question: "{question}"
        Answer:`,
  );

  function onlyContent(docs: { pageContent: string }[]) {
    return docs.map((doc) => doc.pageContent).join("\n\n");
  }

  const chain = RunnableSequence.from([
    {
      context: retriever.pipe(onlyContent),
      question: new RunnablePassthrough(),
    },
    ANSWER_PROMPT,
    llm,
    new StringOutputParser(),
  ]);

  // Pass the user's question to the sequence
  const response = await chain.invoke("Who is Keegorg?");
  console.log(response);
}

main();
