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
import { VertexAIInstrumentation } from "../src/instrumentation";
import * as assert from "assert";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type * as vertexAiImport from "@google-cloud/vertexai";

const memoryExporter = new InMemorySpanExporter();

describe("Test LlamaIndex instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: VertexAIInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let vertexAi: typeof vertexAiImport;

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new VertexAIInstrumentation();
    instrumentation.setTracerProvider(provider);
    vertexAi = require("@google-cloud/vertexai");
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set attributes in span for LLM instrumentation", async () => {
    const vertexAI = new vertexAi.VertexAI({
      project: process.env.VERTEXAI_PROJECT_ID ?? "",
      location: process.env.VERTEXAI_LOCATION ?? "",
    });

    const model = "gemini-pro-vision";

    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generation_config: {
        top_p: 0.9,
        max_output_tokens: 256,
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
      aggregatedResponse.candidates[0].content.parts[0].text;

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;

    assert.strictEqual(attributes["llm.vendor"], "VertexAI");
    assert.strictEqual(attributes["llm.request.type"], "completion");
    assert.strictEqual(attributes["llm.request.model"], model);
    assert.strictEqual(
      attributes["llm.top_p"],
      generativeModel.generation_config?.top_p,
    );
    assert.strictEqual(attributes["llm.prompts.0.content"], prompt);
    assert.strictEqual(attributes["llm.prompts.0.role"], "user");
    assert.strictEqual(attributes["llm.response.model"], model);
    assert.strictEqual(attributes["llm.completions.0.role"], "model");
    assert.strictEqual(
      attributes["llm.completions.0.content"],
      fullTextResponse,
    );
  });
});
