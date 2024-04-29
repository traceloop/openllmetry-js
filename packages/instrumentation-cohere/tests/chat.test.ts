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

import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { CohereInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import * as cohereModule from "cohere-ai";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe.skip("Test Chat with Cohere Instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: CohereInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let cohere: typeof cohereModule;
  let cohereClient: cohereModule.CohereClient;

  setupPolly({
    adapters: [FetchAdapter],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: { headers: false },
  });

  before(async () => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new CohereInstrumentation();
    instrumentation.setTracerProvider(provider);
    cohere = await import("cohere-ai");

    cohereClient = new cohere.CohereClient({
      token:
        process.env.RECORD_MODE === "NEW"
          ? "test"
          : process.env.COHERE_API_KEY!,
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

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set request and response attributes in span for given prompt", async () => {
    const params: cohereModule.Cohere.ChatRequest = {
      chatHistory: [
        { role: "USER", message: "Who discovered gravity?" },
        {
          role: "CHATBOT",
          message:
            "The man who is widely credited with discovering gravity is Sir Isaac Newton",
        },
      ],
      message: "What year was he born?",
      // perform web search before answering the question. You can also use your own custom connector.
      connectors: [{ id: "web-search" }],
    };
    const response = await cohereClient.chat(params);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Cohere");
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_TYPE], "chat");
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    assert.strictEqual(
      attributes[
        `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.role`
      ],
      "user",
    );
    assert.strictEqual(
      attributes[
        `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.user`
      ],
      params.message,
    );
    assert.strictEqual(attributes[SpanAttributes.LLM_TOP_K], params.k);
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_TOP_P], params.p);
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE],
      params.temperature,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_PRESENCE_PENALTY],
      params.presencePenalty,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_FREQUENCY_PENALTY],
      params.frequencyPenalty,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    if (
      "token_count" in response &&
      typeof response.token_count === "object" &&
      response.token_count &&
      "prompt_tokens" in response.token_count &&
      "response_tokens" in response.token_count &&
      "total_tokens" in response.token_count &&
      typeof response.token_count.prompt_tokens === "number" &&
      typeof response.token_count.response_tokens === "number" &&
      typeof response.token_count.total_tokens === "number"
    ) {
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        response.token_count.prompt_tokens,
      );
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        response.token_count.response_tokens,
      );
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        response.token_count.total_tokens,
      );
    }
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      response.text,
    );
    if ("finishReason" in response && response.finishReason) {
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`],
        response.finishReason,
      );
    }
  });

  it("should set request and response attributes in span for given prompt with stream", async () => {
    const params: cohereModule.Cohere.ChatRequest = {
      chatHistory: [
        { role: "USER", message: "Who discovered gravity?" },
        {
          role: "CHATBOT",
          message:
            "The man who is widely credited with discovering gravity is Sir Isaac Newton",
        },
      ],
      message: "What year was he born?",
      // perform web search before answering the question. You can also use your own custom connector.
      connectors: [{ id: "web-search" }],
    };
    const streamedResponse = await cohereClient.chatStream(params);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Cohere");
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_TYPE], "chat");
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    assert.strictEqual(
      attributes[
        `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.role`
      ],
      "user",
    );
    assert.strictEqual(
      attributes[
        `${SpanAttributes.LLM_PROMPTS}.${params.chatHistory?.length ?? 0}.user`
      ],
      params.message,
    );
    assert.strictEqual(attributes[SpanAttributes.LLM_TOP_K], params.k);
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_TOP_P], params.p);
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE],
      params.temperature,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_PRESENCE_PENALTY],
      params.presencePenalty,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_FREQUENCY_PENALTY],
      params.frequencyPenalty,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    for await (const message of streamedResponse) {
      if (message.eventType === "stream-end") {
        const response =
          message as unknown as cohereModule.Cohere.NonStreamedChatResponse;
        if (
          "token_count" in response &&
          typeof response.token_count === "object" &&
          response.token_count &&
          "prompt_tokens" in response.token_count &&
          "response_tokens" in response.token_count &&
          "total_tokens" in response.token_count &&
          typeof response.token_count.prompt_tokens === "number" &&
          typeof response.token_count.response_tokens === "number" &&
          typeof response.token_count.total_tokens === "number"
        ) {
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
            response.token_count.prompt_tokens,
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
            response.token_count.response_tokens,
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
            response.token_count.total_tokens,
          );
        }
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
          "assistant",
        );
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
          response.text,
        );
        if ("finishReason" in response && response.finishReason) {
          assert.strictEqual(
            attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`],
            response.finishReason,
          );
        }
      }
    }
  });
});
