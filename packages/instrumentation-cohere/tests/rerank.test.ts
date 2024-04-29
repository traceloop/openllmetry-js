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

describe.skip("Test Rerank with Cohere Instrumentation", () => {
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

  it("should set request and response attributes in span for given documents", async () => {
    const params: cohereModule.Cohere.RerankRequest = {
      documents: [
        {
          text: "Carson City is the capital city of the American state of Nevada.",
        },
        {
          text: "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
        },
        {
          text: "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
        },
        {
          text: "Capital punishment (the death penalty) has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states.",
        },
      ],
      query: "What is the capital of the United States?",
      topN: 3,
      returnDocuments: true,
    };
    const response = await cohereClient.rerank(params);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Cohere");
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_TYPE], "rerank");
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
      params.query,
    );
    assert.strictEqual(
      attributes[`documents.1.index`],
      typeof params.documents[1] === "string"
        ? params.documents[1]
        : params.documents[1].text,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MODEL],
      params?.model ?? "command",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.relevanceScore`],
      response.results[0].relevanceScore,
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      params.returnDocuments
        ? response.results[0].document?.text
        : response.results[0].index,
    );
  });
});
