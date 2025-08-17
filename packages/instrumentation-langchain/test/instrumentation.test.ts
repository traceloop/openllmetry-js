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
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { createOpenAIToolsAgent, AgentExecutor } from "langchain/agents";
import { Calculator } from "@langchain/community/tools/calculator";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

import { LangChainInstrumentation } from "../src/instrumentation";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Langchain instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: LangChainInstrumentation;
  let bedrockInstrumentation: BedrockInstrumentation;
  let contextManager: AsyncHooksContextManager;

  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    recordFailedRequests: true,
    mode: process.env.RECORD_MODE === "NEW" ? "record" : "replay",
    matchRequestsBy: {
      headers: false,
      url: {
        protocol: true,
        hostname: true,
        pathname: true,
        query: false,
      },
    },
    logging: true,
  });

  before(() => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
      process.env.AWS_ACCESS_KEY_ID = "test";
      process.env.AWS_SECRET_ACCESS_KEY = "test";
    }
    // span processor is already set up during provider initialization
    instrumentation = new LangChainInstrumentation();
    instrumentation.setTracerProvider(provider);

    bedrockInstrumentation = new BedrockInstrumentation();
    bedrockInstrumentation.setTracerProvider(provider);
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

  after(() => {
    instrumentation.disable();
    bedrockInstrumentation.disable();
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

    const result = await wikipediaQuery.invoke("Langchain");

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
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are a helpful assistant that can use tools to answer questions.",
      ],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);
    const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
    });
    const result = await agentExecutor.invoke({
      input: "Solve `5 * (10 + 2)`",
    });

    const spans = memoryExporter.getFinishedSpans();
    const agentSpan = spans.find(
      (span) => span.name === "AgentExecutor.workflow",
    );

    assert.ok(result);
    assert.ok(agentSpan);
    assert.strictEqual(agentSpan.attributes["traceloop.span.kind"], "workflow");
    assert.ok(agentSpan.attributes["traceloop.entity.input"]);
    assert.ok(agentSpan.attributes["traceloop.entity.output"]);
    assert.strictEqual(
      JSON.parse(agentSpan.attributes["traceloop.entity.input"].toString())
        .input,
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

    const inputData = JSON.parse(
      wikipediaSpan.attributes["traceloop.entity.input"].toString(),
    );
    const toolInput = JSON.parse(inputData.args[0]);

    assert.strictEqual(
      toolInput.input,
      '"Current Prime Minister of Malaysia" site:wikipedia.org',
    );
    assert.deepEqual(
      JSON.parse(
        wikipediaSpan.attributes["traceloop.entity.output"].toString(),
      ),
      result,
    );
  }).timeout(300000);

  it("should set attributes in span for BedrockChat with tools", async function () {
    const { BedrockChat } = await import(
      "@langchain/community/chat_models/bedrock"
    );
    const { HumanMessage } = await import("@langchain/core/messages");
    const { tool } = await import("@langchain/core/tools");
    const { z } = await import("zod");

    const get_cities_data_by_country = tool(
      (_args: { country: string }): object => {
        return [
          {
            city: "New York",
            population: 8419600,
          },
          {
            city: "Los Angeles",
            population: 3980400,
          },
          {
            city: "Chicago",
            population: 2716000,
          },
          {
            city: "Houston",
            population: 2328000,
          },
          {
            city: "Phoenix",
            population: 1690000,
          },
        ];
      },
      {
        name: "get_cities_data_by_country",
        description: "Get city population data by country",
        schema: z.object({
          country: z.string(),
        }),
      },
    );

    const model = new BedrockChat({
      model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      region: "us-east-1",
    });
    model.bindTools([get_cities_data_by_country]);

    const message = new HumanMessage({
      content:
        "What is a popular landmark in the most populous city in the US?",
    });

    const response = await model.invoke([message]);

    const spans = memoryExporter.getFinishedSpans();

    assert.ok(response);
    assert.ok(response.content);

    // Look for LLM span created by Bedrock instrumentation
    const llmSpan = spans.find(
      (span) => span.attributes[SpanAttributes.LLM_SYSTEM] === "AWS",
    );

    if (llmSpan) {
      // Test LLM span attributes like in amazon.test.ts
      const attributes = llmSpan.attributes;
      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "AWS");
      assert.strictEqual(
        attributes[SpanAttributes.LLM_REQUEST_TYPE],
        "chat",
      );
      assert.ok(attributes[SpanAttributes.LLM_REQUEST_MODEL]);
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "What is a popular landmark in the most populous city in the US?",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );
      assert.ok(attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`]);
      assert.ok(attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS]);
      assert.ok(attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]);
      assert.ok(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS]);
    } else {
      // Test LangChain callback handler spans - now only creates completion span  
      const completionSpan = spans.find(
        (span) => span.name === "bedrock.chat",
      );

      assert.ok(
        completionSpan,
        `No completion span found. Available spans: ${spans.map((s) => s.name).join(", ")}`,
      );

      // Test completion span attributes
      const completionAttributes = completionSpan.attributes;
      assert.strictEqual(
        completionAttributes[SpanAttributes.LLM_SYSTEM],
        "AWS",
      );
      assert.strictEqual(
        completionAttributes[SpanAttributes.LLM_REQUEST_TYPE],
        "chat",
      );
      assert.strictEqual(
        completionAttributes[SpanAttributes.LLM_REQUEST_MODEL],
        "claude-3-7-sonnet",
      );
      assert.ok(completionAttributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS]);
      assert.ok(
        completionAttributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
      );
      assert.ok(completionAttributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS]);
    }
  }).timeout(300000);
});
