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

import { context, diag, DiagLogger } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { LlamaIndexInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import type * as llamaindexImport from "llamaindex";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  SpanAttributes,
  FinishReasons,
} from "@traceloop/ai-semantic-conventions";
import { CustomLLMInstrumentation } from "../src/custom-llm-instrumentation";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test LlamaIndex instrumentation", async function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: LlamaIndexInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let llamaindex: typeof llamaindexImport;

  setupPolly({
    adapters: ["node-http"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
      order: false,
    },
  });

  before(() => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }

    // span processor is already set up during provider initialization
    instrumentation = new LlamaIndexInstrumentation();
    instrumentation.setTracerProvider(provider);
    llamaindex = require("llamaindex");
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

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it.skip("should add span for all instrumented methods", async () => {
    const directoryReader = new llamaindex.SimpleDirectoryReader();
    const documents = await directoryReader.loadData({
      directoryPath: "test/data",
    });

    const index = await llamaindex.VectorStoreIndex.fromDocuments(documents);
    const queryEngine = index.asQueryEngine();

    const result = await queryEngine.query({
      query: "Where was albert einstein born?",
    });

    assert.ok(result.message);

    const spans = memoryExporter.getFinishedSpans();
    const spanNames = spans.map((span) => span.name);
    const retrieverQueryEngineSpan = spans.find(
      (span) => span.name === "retriever_query_engine.query",
    );

    assert.ok(spanNames.includes("open_ai_embedding.get_query_embedding"));
    assert.ok(spanNames.includes("vector_index_retriever.retrieve"));
    assert.ok(spanNames.includes("retriever_query_engine.retrieve"));
    assert.ok(spanNames.includes("base_synthesizer.synthesize"));
    assert.ok(spanNames.includes("retriever_query_engine.query"));

    assert.ok(retrieverQueryEngineSpan);
    assert.ok(retrieverQueryEngineSpan.attributes["traceloop.entity.input"]);
    assert.ok(retrieverQueryEngineSpan.attributes["traceloop.entity.output"]);
    assert.strictEqual(
      JSON.parse(
        retrieverQueryEngineSpan.attributes[
          "traceloop.entity.input"
        ].toString(),
      ).kwargs.query,
      "Where was albert einstein born?",
    );
    assert.deepStrictEqual(
      JSON.parse(
        retrieverQueryEngineSpan.attributes[
          "traceloop.entity.output"
        ].toString(),
      ).message,
      result.message,
    );
  }).timeout(60000);

  it.skip(
    "should build proper trace on streaming query engine (legacy)",
    async () => {
      const directoryReader = new llamaindex.SimpleDirectoryReader();
      const documents = await directoryReader.loadData({
        directoryPath: "test/data",
      });

      const index = await llamaindex.VectorStoreIndex.fromDocuments(documents);
      const queryEngine = index.asQueryEngine();

      const result = await queryEngine.query({
        query: "Where was albert einstein born?",
        stream: true,
      });

      for await (const res of result) {
        assert.ok(res);
      }

      const spans = memoryExporter.getFinishedSpans();

      const retrieverQueryEngineQuerySpan = spans.find(
        (span) => span.name === "retriever_query_engine.query",
      );
      const synthesizeSpan = spans.find(
        (span) => span.name === "base_synthesizer.synthesize",
      );
      const retrieverQueryEngineRetrieveSpan = spans.find(
        (span) => span.name === "retriever_query_engine.retrieve",
      );
      const openAIEmbeddingSpan = spans.find(
        (span) => span.name === "open_ai_embedding.get_query_embedding",
      );
      const vectorIndexRetrieverSpan = spans.find(
        (span) => span.name === "vector_index_retriever.retrieve",
      );

      assert.strictEqual(
        synthesizeSpan?.parentSpanId,
        retrieverQueryEngineQuerySpan?.spanContext().spanId,
      );

      assert.strictEqual(
        retrieverQueryEngineRetrieveSpan?.parentSpanId,
        retrieverQueryEngineQuerySpan?.spanContext().spanId,
      );

      assert.strictEqual(
        vectorIndexRetrieverSpan?.parentSpanId,
        retrieverQueryEngineRetrieveSpan?.spanContext().spanId,
      );

      assert.strictEqual(
        openAIEmbeddingSpan?.parentSpanId,
        vectorIndexRetrieverSpan?.spanContext().spanId,
      );
    },
  ).timeout(60000);
});

// ─────────────────────────────────────────────────────────────────────────────
// OTel 1.40 migration tests — CustomLLMInstrumentation with mock LLM
// No HTTP, no Polly, no API keys needed.
// ─────────────────────────────────────────────────────────────────────────────

const testDiag: DiagLogger = diag;

function makeMockChat(options: {
  responseContent?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const responseContent = options.responseContent ?? "Hello!";
  const finishReason = options.finishReason ?? "stop";
  const promptTokens = options.promptTokens ?? 10;
  const completionTokens = options.completionTokens ?? 5;

  return async function chat({ stream }: any) {
    if (stream) {
      async function* generate() {
        yield { delta: responseContent };
      }
      return generate();
    }
    return {
      message: { role: "assistant", content: responseContent },
      raw: {
        id: "chatcmpl-test123",
        choices: [{ finish_reason: finishReason }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      },
    };
  };
}

function makeMockChatWithStreamUsage(options: {
  responseContent?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const responseContent = options.responseContent ?? "Hello!";
  const finishReason = options.finishReason ?? "stop";
  const promptTokens = options.promptTokens ?? 10;
  const completionTokens = options.completionTokens ?? 5;

  return async function chat({ stream }: any) {
    if (stream) {
      async function* generate() {
        yield { delta: "partial " };
        yield {
          delta: responseContent,
          raw: {
            id: "chatcmpl-test123",
            choices: [{ finish_reason: finishReason }],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          },
        };
      }
      return generate();
    }
    return {
      message: { role: "assistant", content: responseContent },
      raw: {
        choices: [{ finish_reason: finishReason }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      },
    };
  };
}

describe("CustomLLMInstrumentation — OTel 1.40 attributes", () => {
  const otelExporter = new InMemorySpanExporter();
  const otelProvider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(otelExporter)],
  });
  let contextManager: AsyncHooksContextManager;

  const mockLLMMeta = { model: "gpt-4o", topP: 1 };

  before(() => {
    otelProvider.register();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    otelExporter.reset();
  });

  afterEach(() => {
    context.disable();
  });

  function makeInstrumentation(traceContent = true) {
    return new CustomLLMInstrumentation(
      () => ({ traceContent }),
      testDiag,
      () => otelProvider.getTracer("test"),
    );
  }

  describe("traceContent: true", () => {
    it("sets span name as 'chat {model}'", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const spans = otelExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].name, "chat gpt-4o");
    });

    it("sets gen_ai.provider.name to openai", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_PROVIDER_NAME],
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      );
    });

    it("sets gen_ai.operation.name to chat", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        GEN_AI_OPERATION_NAME_VALUE_CHAT,
      );
    });

    it("sets request and response model", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], "gpt-4o");
      assert.strictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_MODEL], "gpt-4o");
    });

    it("sets gen_ai.input.messages with correct structure", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "What is 2+2?" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[0].parts[0].type, "text");
      assert.strictEqual(inputMessages[0].parts[0].content, "What is 2+2?");
    });

    it("sets gen_ai.output.messages with correct structure", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({ responseContent: "The answer is 4." });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "The answer is 4.",
      );
    });

    it("sets gen_ai.response.finish_reasons (metadata — always set)", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({ finishReason: "stop" });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        [FinishReasons.STOP],
      );
    });

    it("sets gen_ai.response.id", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_ID],
        "chatcmpl-test123",
      );
    });

    it("unknown finish_reason passes through as-is to span attribute", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({ finishReason: "some_future_reason" });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["some_future_reason"],
      );
    });

    it("sets token usage attributes", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({ promptTokens: 10, completionTokens: 5 });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
        15,
      );
    });
  });

  describe("traceContent: false", () => {
    it("does NOT set gen_ai.input.messages", async () => {
      const instr = makeInstrumentation(false);
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined,
      );
    });

    it("does NOT set gen_ai.output.messages", async () => {
      const instr = makeInstrumentation(false);
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("still sets finish_reasons (metadata, not content)", async () => {
      const instr = makeInstrumentation(false);
      const chat = makeMockChat({ finishReason: "stop" });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        [FinishReasons.STOP],
      );
    });

    it("still sets token usage (metadata, not content)", async () => {
      const instr = makeInstrumentation(false);
      const chat = makeMockChat({ promptTokens: 10, completionTokens: 5 });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }] },
      );

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
    });
  });

  describe("streaming", () => {
    it("sets gen_ai.output.messages after stream completes", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({ responseContent: "streamed response" });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      const stream = await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }], stream: true },
      );

      for await (const _chunk of stream) {
        /* consume stream */
      }

      const span = otelExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "streamed response",
      );
    });

    it("does NOT set finish_reasons in streaming when mock omits them", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      const stream = await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }], stream: true },
      );

      for await (const _chunk of stream) {
        /* consume stream */
      }

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        undefined,
      );
    });

    it("streaming with traceContent=false: does NOT set gen_ai.output.messages", async () => {
      const instr = makeInstrumentation(false);
      const chat = makeMockChat({});
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      const stream = await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }], stream: true },
      );

      for await (const _chunk of stream) {
        /* consume stream */
      }

      const span = otelExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("sets finish_reasons and usage when streaming with raw data in last chunk", async () => {
      const instr = makeInstrumentation();
      const chat = makeMockChatWithStreamUsage({
        finishReason: "stop",
        promptTokens: 10,
        completionTokens: 5,
      });
      const wrapped = instr.chatWrapper({ className: "OpenAI" })(chat as any);
      const stream = await wrapped.call(
        { metadata: mockLLMMeta },
        { messages: [{ role: "user", content: "hi" }], stream: true },
      );

      for await (const _chunk of stream) {
        /* consume stream */
      }

      const span = otelExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        [FinishReasons.STOP],
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
        15,
      );
    });
  });
});
