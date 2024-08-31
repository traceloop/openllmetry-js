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
import { Calculator } from "@langchain/community/tools/calculator";
import { pull } from "langchain/hub";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

import { LangChainInstrumentation } from "../src/instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test Langchain instrumentation", async function () {
  const provider = new BasicTracerProvider();
  let instrumentation: LangChainInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let langchainAgentsModule: typeof AgentsModule;
  let langchainChainsModule: typeof ChainsModule;
  let langchainToolsModule: typeof ToolsModule;

  setupPolly({
    adapters: ["node-http"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
    },
  });

  before(() => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new LangChainInstrumentation();
    instrumentation.setTracerProvider(provider);

    langchainAgentsModule = require("langchain/agents");
    langchainChainsModule = require("langchain/chains");
    langchainToolsModule = require("langchain/tools");

    instrumentation.manuallyInstrument({
      chainsModule: langchainChainsModule,
      agentsModule: langchainAgentsModule,
      toolsModule: langchainToolsModule,
    });
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "authorization",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for tools instrumentation", async () => {
    const wikipediaQuery = new WikipediaQueryRun({
      topKResults: 3,
      maxDocContentLength: 100,
    });

    const result = await wikipediaQuery.call("Langchain");

    const spans = memoryExporter.getFinishedSpans();

    const wikipediaSpan = spans.find(
      (span) => span.name === "WikipediaQueryRun.task",
    );

    assert.ok(result);
    assert.ok(wikipediaSpan);
    assert.strictEqual(wikipediaSpan.attributes["traceloop.span.kind"], "task");
  });

  it("should set attributes in span for agent instrumentation", async function () {
    const llm = new ChatOpenAI({});
    const tools = [new Calculator()];
    const prompt = await pull<ChatPromptTemplate>(
      "hwchase17/openai-tools-agent",
    );
    const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
    const agentExecutor = new langchainAgentsModule.AgentExecutor({
      agent,
      tools,
    });
    const result = await agentExecutor.invoke({
      input: "Solve `5 * (10 + 2)`",
    });

    const spans = memoryExporter.getFinishedSpans();
    const agentSpan = spans.find((span) => span.name === "langchain.agent");

    assert.ok(result);
    assert.ok(agentSpan);
    assert.strictEqual(agentSpan.attributes["traceloop.span.kind"], "workflow");
    assert.ok(agentSpan.attributes["traceloop.entity.input"]);
    assert.ok(agentSpan.attributes["traceloop.entity.output"]);
    assert.strictEqual(
      JSON.parse(agentSpan.attributes["traceloop.entity.input"].toString())
        .args[0].input,
      "Solve `5 * (10 + 2)`",
    );
    assert.deepEqual(
      JSON.parse(agentSpan.attributes["traceloop.entity.output"].toString()),
      result,
    );
  }).timeout(60000);

  it.skip(
    "should set attributes in span for chain instrumentation",
    async () => {
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

      const llmChainSpan = spans.find((span) => span.name === "LLMChain.task");
      const stuffDocumentsChainSpan = spans.find(
        (span) => span.name === "StuffDocumentsChain.task",
      );
      const retrievalQASpan = spans.find(
        (span) => span.name === "retrieval_qa.workflow",
      );
      const retrievalQAChainSpan = spans.find(
        (span) => span.name === "RetrievalQAChain.task",
      );

      assert.ok(answer);
      assert.ok(llmChainSpan);
      assert.ok(stuffDocumentsChainSpan);
      assert.ok(retrievalQASpan);
      assert.ok(retrievalQAChainSpan);
      assert.strictEqual(
        llmChainSpan.attributes["traceloop.span.kind"],
        "task",
      );
      assert.strictEqual(
        stuffDocumentsChainSpan.attributes["traceloop.span.kind"],
        "task",
      );
      assert.strictEqual(
        retrievalQASpan.attributes["traceloop.span.kind"],
        "workflow",
      );
      assert.strictEqual(
        retrievalQAChainSpan.attributes["traceloop.span.kind"],
        "task",
      );
      assert.ok(retrievalQAChainSpan.attributes["traceloop.entity.input"]);
      assert.ok(retrievalQAChainSpan.attributes["traceloop.entity.output"]);
      assert.strictEqual(
        JSON.parse(
          retrievalQAChainSpan.attributes["traceloop.entity.input"].toString(),
        ).kwargs.query,
        "What did the author do growing up?",
      );
      assert.deepEqual(
        JSON.parse(
          retrievalQAChainSpan.attributes["traceloop.entity.output"].toString(),
        ),
        answer,
      );
    },
  ).timeout(300000);

  it.skip(
    "should set attributes in span for retrieval qa instrumentation",
    async () => {
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
      const stuffDocumentsChainSpan = spans.find(
        (span) => span.name === "langchain.task.StuffDocumentsChain",
      );
      const llmChainSpan = spans.find(
        (span) => span.name === "langchain.task.LLMChain",
      );
      const retrievalQASpan = spans.find(
        (span) => span.name === "retrieval_qa.workflow",
      );

      assert.ok(answer);
      assert.ok(llmChainSpan);
      assert.ok(stuffDocumentsChainSpan);
      assert.ok(retrievalQASpan);
      assert.strictEqual(
        llmChainSpan.attributes["traceloop.span.kind"],
        "task",
      );
      assert.strictEqual(
        stuffDocumentsChainSpan.attributes["traceloop.span.kind"],
        "task",
      );
      assert.strictEqual(
        retrievalQASpan.attributes["traceloop.span.kind"],
        "workflow",
      );
      assert.ok(retrievalQASpan.attributes["traceloop.entity.input"]);
      assert.ok(retrievalQASpan.attributes["traceloop.entity.output"]);
      assert.strictEqual(
        JSON.parse(
          retrievalQASpan.attributes["traceloop.entity.input"].toString(),
        ).args[0].query,
        "What did the president say about Justice Breyer?",
      );
      assert.deepEqual(
        JSON.parse(
          retrievalQASpan.attributes["traceloop.entity.output"].toString(),
        ),
        answer,
      );
    },
  ).timeout(300000);

  it("should set correct attributes in span for LCEL", async () => {
    const wikipediaQuery = new WikipediaQueryRun({
      topKResults: 3,
      maxDocContentLength: 100,
    });

    const prompt = PromptTemplate.fromTemplate(
      `Turn the following user input into a search query for a wikipedia:
         {input}`,
    );

    const model = new ChatOpenAI({});

    const chain = prompt
      .pipe(model)
      .pipe(new StringOutputParser())
      .pipe(wikipediaQuery);

    const result = await chain.invoke({
      input: "Who is the current prime minister of Malaysia?",
    });

    const spans = memoryExporter.getFinishedSpans();
    const wikipediaSpan = spans.find(
      (span) => span.name === "WikipediaQueryRun.task",
    );

    assert.ok(result);
    assert.ok(wikipediaSpan);
    assert.strictEqual(wikipediaSpan.attributes["traceloop.span.kind"], "task");
    assert.ok(wikipediaSpan.attributes["traceloop.entity.input"]);
    assert.ok(wikipediaSpan.attributes["traceloop.entity.output"]);
    assert.strictEqual(
      JSON.parse(wikipediaSpan.attributes["traceloop.entity.input"].toString())
        .args[0],
      "Current prime minister of Malaysia",
    );
    assert.deepEqual(
      JSON.parse(
        wikipediaSpan.attributes["traceloop.entity.output"].toString(),
      ),
      result,
    );
  }).timeout(300000);
});
