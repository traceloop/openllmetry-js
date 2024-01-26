/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from "assert";

import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import type * as ToolsModule from "langchain/tools";
import type * as AgentsModule from "langchain/agents";
import type * as ChainsModule from "langchain/chains";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { createOpenAIToolsAgent } from "langchain/agents";
import { Calculator } from "langchain/tools/calculator";
import { pull } from "langchain/hub";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { LangChainInstrumentation } from "../src/instrumentation";

const memoryExporter = new InMemorySpanExporter();

describe("Test LlamaIndex instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: LangChainInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let langchainAgentsModule: typeof AgentsModule;
  let langchainToolsModule: typeof ToolsModule;
  let langchainChainsModule: typeof ChainsModule;

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new LangChainInstrumentation();
    instrumentation.setTracerProvider(provider);
    langchainAgentsModule = require("langchain/agents");
    langchainToolsModule = require("langchain/tools");
    langchainChainsModule = require("langchain/chains");
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for tools and agent instrumentation", async () => {
    const llm = new ChatOpenAI({});
    const tools = [new Calculator(), new langchainToolsModule.SerpAPI()];
    const prompt = await pull<ChatPromptTemplate>(
      "hwchase17/openai-tools-agent",
    );
    const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
    const agentExecutor = new langchainAgentsModule.AgentExecutor({
      agent,
      tools,
    });
    const result = await agentExecutor.invoke({
      input:
        "By searching the Internet, find how many albums has Boldy James dropped since 2010 and how many albums has Nas dropped since 2010? Find who dropped more albums and show the difference in percent.",
    });

    const spans = memoryExporter.getFinishedSpans();
    const spanNames = spans.map((span) => span.name);

    assert.ok(result);
    assert.ok(spanNames.includes("langchain.task.SerpAPI"));
    assert.ok(spanNames.includes("langchain.agent"));
  }).timeout(60000);

  it("should set attributes in span for chain instrumentation", async () => {
    const slowerModel = new OpenAI({
      modelName: "gpt-3.5-turbo-instruct",
      temperature: 0.0,
    });
    const SYSTEM_TEMPLATE = `Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say that you don't know, don't try to make up an answer.
    ----------------
    {context}`;
    const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
    const text = "sample text";
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const docs = await textSplitter.createDocuments([text]);
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );
    const chain = new langchainChainsModule.RetrievalQAChain({
      combineDocumentsChain: langchainChainsModule.loadQAStuffChain(
        slowerModel,
        { prompt },
      ),
      retriever: vectorStore.asRetriever(2),
      returnSourceDocuments: true,
    });
    const answer = await chain.call({
      query: "What did the author do growing up?",
      k: 8,
    });
    const spans = memoryExporter.getFinishedSpans();
    const spanNames = spans.map((span) => span.name);

    assert.ok(answer);
    assert.ok(spanNames.includes("langchain.task.LLMChain"));
    assert.ok(spanNames.includes("langchain.task.StuffDocumentsChain"));
    assert.ok(spanNames.includes("retrieval_qa.workflow"));
    assert.ok(spanNames.includes("langchain.task.RetrievalQAChain"));
  }).timeout(300000);

  it("should set attributes in span for retrieval qa instrumentation", async () => {
    const llm = new ChatOpenAI({});
    const text = "sample text";
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    const docs = await textSplitter.createDocuments([text]);
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );
    const vectorStoreRetriever = vectorStore.asRetriever();
    const chain = langchainChainsModule.RetrievalQAChain.fromLLM(
      llm,
      vectorStoreRetriever,
    );
    const answer = await chain.invoke({
      query: "What did the president say about Justice Breyer?",
    });

    const spans = memoryExporter.getFinishedSpans();
    const spanNames = spans.map((span) => span.name);

    assert.ok(answer);
    assert.ok(spanNames.includes("langchain.task.StuffDocumentsChain"));
    assert.ok(spanNames.includes("langchain.task.LLMChain"));
    assert.ok(spanNames.includes("retrieval_qa.workflow"));
  }).timeout(300000);
});
