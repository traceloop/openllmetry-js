import * as fs from "fs";

import * as traceloop from "@traceloop/node-server-sdk";

import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { OpenAIEmbeddings, OpenAI } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains";
import { createOpenAIToolsAgent, AgentExecutor } from "langchain/agents";
import { Calculator } from "@langchain/community/tools/calculator";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

traceloop.initialize({
  appName: "sample_langchain",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

class SampleLangchain {
  @traceloop.workflow({ name: "sample_retrieval_qa_example" })
  async retrievalQAChainExample() {
    // Initialize the LLM to use to answer the question.
    const model = new ChatOpenAI({});

    const text = fs.readFileSync(
      "./data/paul_graham/paul_graham_essay.txt",
      "utf8",
    );
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const docs = await textSplitter.createDocuments([text]);

    // Create a vector store from the documents.
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );

    // Initialize a retriever wrapper around the vector store
    const vectorStoreRetriever = vectorStore.asRetriever();

    const chain = RetrievalQAChain.fromLLM(model, vectorStoreRetriever);
    const answer = await chain.invoke({
      query: "What did the president say about Justice Breyer?",
    });

    return answer;
  }

  @traceloop.workflow({ name: "sample_tools_example" })
  async toolsExample() {
    const llm = new ChatOpenAI({});
    const tools = [new Calculator()];

    // Create a simple prompt template directly instead of using pull
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are a helpful assistant. Use the available tools when needed.",
      ],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    // Create agent with any type to bypass deep instantiation issue
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
    } as any);
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
    });

    const result = await agentExecutor.invoke({
      input: "What is 25 * 4?",
    });
    return result;
  }

  @traceloop.workflow({ name: "sample_qa_stuff_chain" })
  async qaStuffChainExample() {
    const slowerModel = new OpenAI({
      modelName: "gpt-3.5-turbo-instruct",
      temperature: 0.0,
    });
    const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say that you don't know, don't try to make up an answer.
    ----------------
    {context}`;
    const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
    const text = fs.readFileSync(
      "./data/paul_graham/paul_graham_essay.txt",
      "utf8",
    );
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const docs = await textSplitter.createDocuments([text]);
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );
    const chain = new RetrievalQAChain({
      combineDocumentsChain: loadQAStuffChain(slowerModel, { prompt }),
      retriever: vectorStore.asRetriever(2),
      returnSourceDocuments: true,
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
      await sampleLangchain.retrievalQAChainExample();
    console.log(retrievalQAChainResult);
    const toolsResult = await sampleLangchain.toolsExample();
    console.log(toolsResult);
    const qaStuffChainResult = await sampleLangchain.qaStuffChainExample();
    console.log(qaStuffChainResult);
  },
);
