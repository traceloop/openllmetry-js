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
import { VertexAIInstrumentation } from "../src/vertexai-instrumentation";
import * as assert from "assert";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type * as vertexAiImport from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";
import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import {
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
} from "@opentelemetry/semantic-conventions/incubating";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);

const GENERATE_CONTENT_RESPONSE = JSON.stringify({
  candidates: [
    {
      content: {
        parts: [
          {
            text: "Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine.",
          },
        ],
        role: "model",
      },
      finishReason: "STOP",
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 6,
    candidatesTokenCount: 14,
    totalTokenCount: 20,
  },
});

const STREAM_CONTENT_RESPONSE =
  `data: ${JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { text: "The four cardinal directions are North, South, East, and West." },
          ],
          role: "model",
        },
        finishReason: "STOP",
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 9,
      candidatesTokenCount: 13,
      totalTokenCount: 22,
    },
  })}\n\n`;

describe("Test Gemini GenerativeModel Instrumentation", () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: VertexAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let vertexAi: typeof vertexAiImport;
  let originalGetAccessToken: typeof GoogleAuth.prototype.getAccessToken;
  let origProjectId: string | undefined;
  let origLocation: string | undefined;

  setupPolly({
    adapters: ["node-http", "fetch"],
    mode: "passthrough",
  });

  before(async () => {
    origProjectId = process.env.VERTEXAI_PROJECT_ID;
    origLocation = process.env.VERTEXAI_LOCATION;
    process.env.VERTEXAI_PROJECT_ID = "test-project";
    process.env.VERTEXAI_LOCATION = "us-central1";
    // Stub Google Auth to return a fake token so no real OAuth request is made
    originalGetAccessToken = GoogleAuth.prototype.getAccessToken;
    GoogleAuth.prototype.getAccessToken = () =>
      Promise.resolve("fake-token") as any;

    instrumentation = new VertexAIInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    vertexAi = require("@google-cloud/vertexai");
    instrumentation.manuallyInstrument(vertexAi);
  });

  after(() => {
    if (originalGetAccessToken) {
      GoogleAuth.prototype.getAccessToken = originalGetAccessToken;
    }
    if (origProjectId === undefined) {
      delete process.env.VERTEXAI_PROJECT_ID;
    } else {
      process.env.VERTEXAI_PROJECT_ID = origProjectId;
    }
    if (origLocation === undefined) {
      delete process.env.VERTEXAI_LOCATION;
    } else {
      process.env.VERTEXAI_LOCATION = origLocation;
    }
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);

    const { server } = this.polly as Polly;
    // Intercept all VertexAI API calls and return mock responses
    server
      .post(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-pro-vision:generateContent",
      )
      .intercept((_req, res) => {
        res.status(200).json(JSON.parse(GENERATE_CONTENT_RESPONSE));
      });

    server
      .post(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-pro-vision:streamGenerateContent",
      )
      .intercept((_req, res) => {
        res
          .status(200)
          .setHeader("content-type", "text/event-stream")
          .send(STREAM_CONTENT_RESPONSE);
      });
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set request and response attributes in span for Text prompts with non-stream response", async () => {
    const vertexAI = new vertexAi.VertexAI({
      project: process.env.VERTEXAI_PROJECT_ID ?? "test-project",
      location: process.env.VERTEXAI_LOCATION ?? "us-central1",
    });

    const model = "gemini-pro-vision";

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        topP: 0.9,
        maxOutputTokens: 256,
      },
    });
    const prompt = "What is Node.js?";
    const request = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };
    const responseStream = await generativeModel.generateContent(request);
    const aggregatedResponse = await responseStream.response;

    const fullTextResponse =
      aggregatedResponse.candidates![0].content.parts[0].text;

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;

    assert.strictEqual(attributes[ATTR_GEN_AI_SYSTEM], "Google");
    assert.strictEqual(attributes["llm.request.type"], "completion");
    assert.strictEqual(attributes[ATTR_GEN_AI_REQUEST_MODEL], model);
    assert.strictEqual(attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.9);
    assert.strictEqual(attributes["gen_ai.prompt.0.content"], prompt);
    assert.strictEqual(attributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(attributes[ATTR_GEN_AI_RESPONSE_MODEL], model);
    assert.strictEqual(attributes["gen_ai.completion.0.role"], "model");
    assert.strictEqual(
      attributes["gen_ai.completion.0.content"],
      fullTextResponse,
    );
  });

  it("should set request and response attributes in span for Text prompts with streaming response", async () => {
    const vertexAI = new vertexAi.VertexAI({
      project: process.env.VERTEXAI_PROJECT_ID ?? "test-project",
      location: process.env.VERTEXAI_LOCATION ?? "us-central1",
    });

    const model = "gemini-pro-vision";

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        topP: 0.9,
        maxOutputTokens: 256,
      },
    });
    const prompt = "What are the 4 cardinal directions?";
    const request = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };
    const responseStream = await generativeModel.generateContentStream(request);

    // Consume the stream
    for await (const _item of responseStream.stream) {
      // intentionally empty — drain the stream so the span is finalized
    }

    const aggregatedResponse = await responseStream.response;
    const fullTextResponse =
      aggregatedResponse.candidates![0].content.parts[0].text;

    assert.ok(fullTextResponse);

    const spans = memoryExporter.getFinishedSpans();

    assert.notStrictEqual(spans.length, 0);

    const attributes = spans[0].attributes;

    assert.strictEqual(attributes[ATTR_GEN_AI_SYSTEM], "Google");
    assert.strictEqual(attributes["llm.request.type"], "completion");
    assert.strictEqual(attributes[ATTR_GEN_AI_REQUEST_MODEL], model);
    assert.strictEqual(attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.9);
    assert.strictEqual(attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 256);
    assert.strictEqual(attributes["gen_ai.prompt.0.content"], prompt);
    assert.strictEqual(attributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(attributes[ATTR_GEN_AI_RESPONSE_MODEL], model);
    assert.strictEqual(attributes["gen_ai.completion.0.role"], "model");
    assert.strictEqual(
      attributes["gen_ai.completion.0.content"],
      fullTextResponse,
    );
  });
});
