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
import { BedrockInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import * as bedrockModule from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Ai21 with AWS Bedrock Instrumentation", () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: BedrockInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let bedrock: typeof bedrockModule;
  let bedrockRuntimeClient: bedrockModule.BedrockRuntimeClient;

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

  before(async () => {
    // span processor is already set up during provider initialization
    instrumentation = new BedrockInstrumentation();
    instrumentation.setTracerProvider(provider);
    bedrock = await import("@aws-sdk/client-bedrock-runtime");

    bedrockRuntimeClient = new bedrock.BedrockRuntimeClient(
      process.env.RECORD_MODE !== "NEW"
        ? {
            region: "us-east-1",
            credentials: { accessKeyId: "test", secretAccessKey: "test" },
            requestHandler: new NodeHttpHandler(),
          }
        : {},
    );
  });

  after(() => {
    instrumentation.disable();
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) =>
          name != "authorization" &&
          name != "x-amz-content-sha256" &&
          name != "amz-sdk-invocation-id" &&
          name != "x-amz-date",
      );
    });
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set request and response attributes in span for given prompt", async () => {
    const prompt = `What are the 4 cardinal directions?`;
    const params = {
      prompt,
      maxTokens: 200,
      temperature: 0.7,
      topP: 1,
      presencePenalty: { scale: 0 },
      frequencyPenalty: { scale: 0 },
    };
    const input = {
      modelId: "ai21.j2-ultra-v1",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(params),
    };

    const [, model] = input.modelId.split(".");

    const command = new bedrock.InvokeModelCommand(input);
    const response = await bedrockRuntimeClient.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "AWS");
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TYPE],
      "completion",
    );
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_MODEL], model);
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TOP_P],
      params.topP,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_PRESENCE_PENALTY],
      params.presencePenalty.scale,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_FREQUENCY_PENALTY],
      params.frequencyPenalty.scale,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TEMPERATURE],
      params.temperature,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS],
      params.maxTokens,
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
      "user",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
      prompt,
    );
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_MODEL], model);
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
      "assistant",
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`],
      parsedResponse["completions"][0]["finishReason"]["reason"],
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      parsedResponse["completions"][0]["data"]["text"],
    );
  });
});
