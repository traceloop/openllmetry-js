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
import { AIPlatformInstrumentation } from "../src/aiplatform-instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type * as aiplatformImport from "@google-cloud/aiplatform";
import { google } from "@google-cloud/aiplatform/build/protos/protos";

const memoryExporter = new InMemorySpanExporter();

describe.skip("Test PaLM2 PredictionServiceClient Instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: AIPlatformInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let aiplatform: typeof aiplatformImport;

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new AIPlatformInstrumentation();
    instrumentation.setTracerProvider(provider);
    aiplatform = require("@google-cloud/aiplatform");
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set request and response attributes in span for Text prompt", async () => {
    const publisher = "google";
    const project = process.env.VERTEXAI_PROJECT_ID ?? "";
    const location = process.env.VERTEXAI_LOCATION ?? "";

    const predictionServiceClient = new aiplatform.PredictionServiceClient({
      apiEndpoint: "us-central1-aiplatform.googleapis.com",
    });

    const model = "text-bison@001";
    const endpoint = `projects/${project}/locations/${location}/publishers/${publisher}/models/${model}`;

    const prompt = {
      prompt: "What are the cardinal directions?",
    };

    const instanceValue = aiplatform.helpers.toValue(prompt);
    const instances = [instanceValue] as google.protobuf.IValue[];

    const parameter = {
      temperature: 0.2,
      maxOutputTokens: 256,
      topP: 0.95,
      topK: 40,
    };
    const parameters = aiplatform.helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    const [response] = await predictionServiceClient.predict(request);
    const fullTextResponse =
      response?.predictions?.[0].structValue?.fields?.content.stringValue;

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;

    assert.strictEqual(attributes["gen_ai.system"], "VertexAI");
    assert.strictEqual(attributes["llm.request.type"], "completion");
    assert.strictEqual(attributes["gen_ai.request.model"], model);
    assert.strictEqual(attributes["gen_ai.request.top_p"], parameter.topP);
    assert.strictEqual(attributes["llm.top_k"], parameter.topK);
    assert.strictEqual(attributes["gen_ai.prompt.0.content"], prompt.prompt);
    assert.strictEqual(attributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(attributes["gen_ai.response.model"], model);
    assert.strictEqual(attributes["gen_ai.completion.0.role"], "assistant");
    assert.strictEqual(
      attributes["gen_ai.completion.0.content"],
      fullTextResponse,
    );
  });

  it("should set request and response attributes in span for Chat prompt", async () => {
    const publisher = "google";
    const project = process.env.VERTEXAI_PROJECT_ID ?? "";
    const location = process.env.VERTEXAI_LOCATION ?? "";

    const predictionServiceClient = new aiplatform.PredictionServiceClient({
      apiEndpoint: "us-central1-aiplatform.googleapis.com",
    });

    const model = "chat-bison@001";
    const endpoint = `projects/${project}/locations/${location}/publishers/${publisher}/models/${model}`;

    const prompt = {
      context:
        "My name is Miles. You are an astronomer, knowledgeable about the solar system.",
      examples: [
        {
          input: { content: "How many moons does Mars have?" },
          output: {
            content: "The planet Mars has two moons, Phobos and Deimos.",
          },
        },
      ],
      messages: [
        {
          author: "user",
          content: "How many planets are there in the solar system?",
        },
      ],
    };
    const instanceValue = aiplatform.helpers.toValue(prompt);
    const instances = [instanceValue] as google.protobuf.IValue[];

    const parameter = {
      temperature: 0.2,
      maxOutputTokens: 256,
      topP: 0.95,
      topK: 40,
    };
    const parameters = aiplatform.helpers.toValue(parameter);

    const request = {
      endpoint,
      instances,
      parameters,
    };

    const [response] = await predictionServiceClient.predict(request);
    const predictions = response.predictions;

    const fullTextResponse =
      predictions?.[0].structValue?.fields?.candidates.listValue?.values?.[0]
        ?.structValue?.fields?.content.stringValue;

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;

    assert.strictEqual(attributes["gen_ai.system"], "VertexAI");
    assert.strictEqual(attributes["llm.request.type"], "completion");
    assert.strictEqual(attributes["gen_ai.request.model"], model);
    assert.strictEqual(attributes["gen_ai.request.top_p"], parameter.topP);
    assert.strictEqual(attributes["llm.top_k"], parameter.topK);
    assert.strictEqual(
      attributes["gen_ai.prompt.0.content"],
      prompt.messages[0].content,
    );
    assert.strictEqual(attributes["gen_ai.prompt.0.role"], "user");
    assert.strictEqual(attributes["gen_ai.response.model"], model);
    assert.strictEqual(attributes["gen_ai.completion.0.role"], "assistant");
    assert.strictEqual(
      attributes["gen_ai.completion.0.content"],
      fullTextResponse,
    );
  });
});
