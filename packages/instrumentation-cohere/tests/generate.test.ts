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

describe.skip("Test Generate with Cohere Instrumentation", () => {
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
    const params: cohereModule.Cohere.GenerateRequest = {
      model: "command-light",
      prompt: "What happened to Pluto?",
      k: 1,
      temperature: 2,
    };
    const response = await cohereClient.generate(params);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Cohere");
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TYPE],
      "completion",
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`],
      params.prompt,
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
      typeof response.meta?.billedUnits?.inputTokens === "number" &&
      typeof response.meta?.billedUnits?.outputTokens === "number"
    ) {
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        response.meta?.billedUnits?.inputTokens,
      );
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        response.meta?.billedUnits?.outputTokens,
      );
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        response.meta?.billedUnits?.inputTokens +
          response.meta?.billedUnits?.outputTokens,
      );
    }
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      response.generations[0].text,
    );
  });

  it("should set request and response attributes in span for given prompt with Streaming response", async () => {
    const params: cohereModule.Cohere.GenerateRequest = {
      model: "command-light",
      prompt: "What happened to Pluto?",
      k: 1,
      temperature: 2,
    };
    const streamedResponse = await cohereClient.generateStream(params);

    const spans = memoryExporter.getFinishedSpans();
    const attributes = spans[0].attributes;

    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Cohere");
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TYPE],
      "completion",
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );

    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.user`],
      params.prompt,
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
        const response = message as unknown as cohereModule.Cohere.Generation;
        if (
          typeof response.meta?.billedUnits?.inputTokens === "number" &&
          typeof response.meta?.billedUnits?.outputTokens === "number"
        ) {
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
            response.meta?.billedUnits?.inputTokens,
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
            response.meta?.billedUnits?.outputTokens,
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
            response.meta?.billedUnits?.inputTokens +
              response.meta?.billedUnits?.outputTokens,
          );
        }
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
          "assistant",
        );
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
          response.generations[0].text,
        );
      }
    }
  });
});
