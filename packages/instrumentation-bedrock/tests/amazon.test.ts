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
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import * as bedrockModule from "@aws-sdk/client-bedrock-runtime";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

describe("Test Amazon Titan with AWS Bedrock Instrumentation", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: BedrockInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let bedrock: typeof bedrockModule;
  let bedrockRuntimeClient: bedrockModule.BedrockRuntimeClient;

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new BedrockInstrumentation();
    instrumentation.setTracerProvider(provider);
    bedrock = require("@aws-sdk/client-bedrock-runtime");

    bedrockRuntimeClient = new bedrock.BedrockRuntimeClient();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it("should set request and response attributes in span for given prompt", async () => {
    const prompt = `What are the 4 cardinal directions?`;
    const params = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 4096,
        stopSequences: [],
        temperature: 0,
        topP: 1,
      },
    };
    const input = {
      modelId: "amazon.titan-text-express-v1",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(params),
    };

    const [vendor, model] = input.modelId.split(".");

    const command = new bedrock.InvokeModelCommand(input);
    const response = await bedrockRuntimeClient.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(jsonString);

    const spans = memoryExporter.getFinishedSpans();

    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SpanAttributes.LLM_VENDOR], vendor);
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_TYPE],
      "completion",
    );
    assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_MODEL], model);
    assert.strictEqual(
      attributes[SpanAttributes.LLM_TOP_P],
      params.textGenerationConfig.topP,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_TEMPERATURE],
      params.textGenerationConfig.temperature,
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS],
      params.textGenerationConfig.maxTokenCount,
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
      attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
      parsedResponse["inputTextTokenCount"],
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
      parsedResponse["results"][0]["tokenCount"],
    );
    assert.strictEqual(
      attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
      parsedResponse["inputTextTokenCount"] +
        parsedResponse["results"][0]["tokenCount"],
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`],
      parsedResponse["results"][0]["completionReason"],
    );
    assert.strictEqual(
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
      parsedResponse["results"][0]["outputText"],
    );
  });

  it("should set request and response attributes in span for given prompt with streaming result", async () => {
    const prompt = `What are the 4 cardinal directions?`;
    const params = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 4096,
        stopSequences: [],
        temperature: 0,
        topP: 1,
      },
    };
    const input = {
      modelId: "amazon.titan-text-express-v1",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(params),
    };

    const [vendor, model] = input.modelId.split(".");

    const command = new bedrock.InvokeModelWithResponseStreamCommand(input);
    const response = await bedrockRuntimeClient.send(command);
    if (response.body) {
      for await (const value of response.body!) {
        const jsonString = new TextDecoder().decode(value.chunk?.bytes);
        const parsedResponse = JSON.parse(jsonString);

        const spans = memoryExporter.getFinishedSpans();

        const attributes = spans[0].attributes;

        assert.strictEqual(attributes[SpanAttributes.LLM_VENDOR], vendor);
        assert.strictEqual(
          attributes[SpanAttributes.LLM_REQUEST_TYPE],
          "completion",
        );
        assert.strictEqual(attributes[SpanAttributes.LLM_REQUEST_MODEL], model);
        assert.strictEqual(
          attributes[SpanAttributes.LLM_TOP_P],
          params.textGenerationConfig.topP,
        );
        assert.strictEqual(
          attributes[SpanAttributes.LLM_TEMPERATURE],
          params.textGenerationConfig.temperature,
        );
        assert.strictEqual(
          attributes[SpanAttributes.LLM_REQUEST_MAX_TOKENS],
          params.textGenerationConfig.maxTokenCount,
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
          attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
          parsedResponse["inputTextTokenCount"],
        );
        assert.strictEqual(
          attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
          parsedResponse["totalOutputTextTokenCount"],
        );
        assert.strictEqual(
          attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
          parsedResponse["inputTextTokenCount"] +
            parsedResponse["totalOutputTextTokenCount"],
        );
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.finish_reason`],
          parsedResponse["completionReason"],
        );
        assert.strictEqual(
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
          parsedResponse["outputText"],
        );

        if ("amazon-bedrock-invocationMetrics" in parsedResponse) {
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
            parsedResponse["amazon-bedrock-invocationMetrics"][
              "inputTokenCount"
            ],
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
            parsedResponse["amazon-bedrock-invocationMetrics"][
              "outputTokenCount"
            ],
          );
          assert.strictEqual(
            attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
            parsedResponse["amazon-bedrock-invocationMetrics"][
              "inputTokenCount"
            ] +
              parsedResponse["amazon-bedrock-invocationMetrics"][
                "outputTokenCount"
              ],
          );
        }
      }
    }
  });
});