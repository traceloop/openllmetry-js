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

import { openai as vercel_openai } from "@ai-sdk/openai";
import { google as vercel_google } from "@ai-sdk/google";
import { anthropic as vercel_anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_SYSTEM,
} from "@opentelemetry/semantic-conventions/incubating";

import * as traceloop from "../../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { initializeSharedTraceloop, getSharedExporter } from "../test-setup";

const memoryExporter = getSharedExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test AI SDK Integration with Recording", function () {
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

  before(async function () {
    if (process.env.RECORD_MODE !== "NEW") {
      // Set dummy API keys for replay mode
      process.env.OPENAI_API_KEY = "test";
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test";
      process.env.ANTHROPIC_API_KEY = "test";
      process.env.AWS_ACCESS_KEY_ID = "test";
      process.env.AWS_SECRET_ACCESS_KEY = "test";
      process.env.AWS_REGION = "us-east-1";
    }

    // Use shared initialization to avoid conflicts with other test suites
    initializeSharedTraceloop();
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) =>
          !["authorization", "x-api-key", "x-goog-api-key"].includes(
            name.toLowerCase(),
          ),
      );
    });
  });

  afterEach(async () => {
    await traceloop.forceFlush();
    memoryExporter.reset();
  });

  it("should capture OpenAI provider spans correctly with recording", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_openai_workflow" },
      async () => {
        return await generateText({
          messages: [
            { role: "user", content: "What is 2+2? Give a brief answer." },
          ],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    const generateTextSpan = spans.find(
      (span) => span.name === "text.generate",
    );

    assert.ok(result);
    assert.ok(result.text);
    assert.ok(generateTextSpan);

    // Verify span name (should be transformed from ai.generateText.doGenerate to text.generate)
    assert.strictEqual(generateTextSpan.name, "text.generate");

    // Verify vendor
    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_SYSTEM],
      "OpenAI",
    );

    // Verify model information
    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      "gpt-3.5-turbo",
    );

    // Verify prompt
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.prompt.0.role"],
      "user",
    );
    assert.ok(generateTextSpan.attributes["gen_ai.prompt.0.content"]);

    // Verify response
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.completion.0.role"],
      "assistant",
    );
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.completion.0.content"],
      result.text,
    );

    // Verify token usage - should be transformed to input/output tokens
    assert.ok(generateTextSpan.attributes["gen_ai.usage.input_tokens"]);
    assert.ok(generateTextSpan.attributes["gen_ai.usage.output_tokens"]);
    assert.ok(generateTextSpan.attributes["llm.usage.total_tokens"]);
  });

  it("should capture Google Gemini provider spans correctly with recording", async () => {
    // Clear any leftover spans from previous tests
    memoryExporter.reset();

    const result = await traceloop.withWorkflow(
      { name: "test_google_workflow" },
      async () => {
        return await generateText({
          messages: [
            { role: "user", content: "What is 2+2? Give a brief answer." },
          ],
          model: vercel_google("gemini-1.5-flash"),
          experimental_telemetry: { isEnabled: true },
        });
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    // Find the Google span specifically (should have workflow name test_google_workflow)
    const generateTextSpan = spans.find(
      (span) =>
        span.name === "text.generate" &&
        span.attributes["traceloop.workflow.name"] === "test_google_workflow",
    );

    assert.ok(result);
    assert.ok(result.text);
    assert.ok(generateTextSpan, "Could not find Google generateText span");

    // Verify span name (should be transformed from ai.generateText.doGenerate to text.generate)
    assert.strictEqual(generateTextSpan.name, "text.generate");

    // Verify vendor
    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_SYSTEM],
      "Google",
    );

    // Verify model information
    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      "gemini-1.5-flash",
    );

    // Verify prompt
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.prompt.0.role"],
      "user",
    );
    assert.ok(generateTextSpan.attributes["gen_ai.prompt.0.content"]);

    // Verify response
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.completion.0.role"],
      "assistant",
    );
    assert.strictEqual(
      generateTextSpan.attributes["gen_ai.completion.0.content"],
      result.text,
    );

    // Verify token usage - should be transformed to input/output tokens
    assert.ok(generateTextSpan.attributes["gen_ai.usage.input_tokens"]);
    assert.ok(generateTextSpan.attributes["gen_ai.usage.output_tokens"]);
    assert.ok(generateTextSpan.attributes["llm.usage.total_tokens"]);
  });

  it("should set LLM_INPUT_MESSAGES and LLM_OUTPUT_MESSAGES attributes for chat completions", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_transformations_workflow" },
      async () => {
        return await generateText({
          messages: [
            { role: "user", content: "What is 2+2? Give a brief answer." },
          ],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      },
    );

    assert.ok(result);
    assert.ok(result.text);

    const spans = memoryExporter.getFinishedSpans();
    const aiSdkSpan = spans.find((span) => span.name === "text.generate");

    assert.ok(aiSdkSpan);

    // Verify LLM_INPUT_MESSAGES attribute exists and is valid JSON
    assert.ok(aiSdkSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    const inputMessages = JSON.parse(
      aiSdkSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
    );
    assert.ok(Array.isArray(inputMessages));
    assert.strictEqual(inputMessages.length, 1);

    // Check user message structure
    assert.strictEqual(inputMessages[0].role, "user");
    assert.ok(Array.isArray(inputMessages[0].parts));
    assert.strictEqual(inputMessages[0].parts[0].type, "text");
    assert.strictEqual(
      inputMessages[0].parts[0].content,
      "What is 2+2? Give a brief answer.",
    );

    // Verify LLM_OUTPUT_MESSAGES attribute exists and is valid JSON
    assert.ok(aiSdkSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    const outputMessages = JSON.parse(
      aiSdkSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.ok(Array.isArray(outputMessages));
    assert.strictEqual(outputMessages.length, 1);

    // Check assistant response structure
    assert.strictEqual(outputMessages[0].role, "assistant");
    assert.ok(Array.isArray(outputMessages[0].parts));
    assert.strictEqual(outputMessages[0].parts[0].type, "text");
    assert.ok(outputMessages[0].parts[0].content);
    assert.ok(typeof outputMessages[0].parts[0].content === "string");
  });

  it("should capture and transform Anthropic cache tokens from providerMetadata", async function () {
    this.timeout(30000);
    memoryExporter.reset();

    const result = await traceloop.withWorkflow(
      { name: "test_anthropic_cache_workflow" },
      async () => {
        return await generateText({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. Here is some context that should be cached for efficiency: " +
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(
                  100,
                ),
            },
            { role: "user", content: "What is 2+2?" },
          ],
          model: vercel_anthropic("claude-3-haiku-20240307"),
          experimental_telemetry: {
            isEnabled: true,
          },
        });
      },
    );

    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();
    const generateTextSpan = spans.find(
      (span) =>
        span.name === "text.generate" &&
        span.attributes["traceloop.workflow.name"] ===
          "test_anthropic_cache_workflow",
    );

    assert.ok(result);
    assert.ok(result.text);
    assert.ok(
      generateTextSpan,
      "Could not find Anthropic generateText span with cache tokens",
    );

    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_SYSTEM],
      "Anthropic",
    );

    assert.ok(
      (
        generateTextSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL] as string
      ).includes("claude"),
    );

    assert.ok(
      generateTextSpan.attributes[
        SpanAttributes.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS
      ] !== undefined,
      "cache_creation_input_tokens should be present",
    );
    assert.strictEqual(
      typeof generateTextSpan.attributes[
        SpanAttributes.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS
      ],
      "number",
    );
    assert.ok(
      (generateTextSpan.attributes[
        SpanAttributes.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS
      ] as number) > 0,
      "cache_creation_input_tokens should be greater than 0",
    );
  });

  it("should capture and transform OpenAI cache tokens from providerMetadata", async function () {
    this.timeout(30000);
    memoryExporter.reset();

    const result = await traceloop.withWorkflow(
      { name: "test_openai_cache_workflow" },
      async () => {
        return await generateText({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. Here is some context: " +
                "Lorem ipsum dolor sit amet. ".repeat(50),
            },
            { role: "user", content: "What is 2+2?" },
          ],
          model: vercel_openai("gpt-4o-mini"),
          experimental_telemetry: {
            isEnabled: true,
          },
        });
      },
    );

    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();
    const generateTextSpan = spans.find(
      (span) =>
        span.name === "text.generate" &&
        span.attributes["traceloop.workflow.name"] ===
          "test_openai_cache_workflow",
    );

    assert.ok(result);
    assert.ok(result.text);
    assert.ok(
      generateTextSpan,
      "Could not find OpenAI generateText span with cache tokens",
    );

    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_SYSTEM],
      "OpenAI",
    );

    assert.strictEqual(
      generateTextSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      "gpt-4o-mini",
    );

    if (
      generateTextSpan.attributes[
        SpanAttributes.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS
      ] !== undefined
    ) {
      assert.strictEqual(
        typeof generateTextSpan.attributes[
          SpanAttributes.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS
        ],
        "number",
      );
      assert.ok(
        (generateTextSpan.attributes[
          SpanAttributes.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS
        ] as number) >= 0,
        "cache_read_input_tokens should be a valid number",
      );
    }

    if (
      generateTextSpan.attributes[
        SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS
      ] !== undefined
    ) {
      assert.strictEqual(
        typeof generateTextSpan.attributes[
          SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS
        ],
        "number",
      );
      assert.ok(
        (generateTextSpan.attributes[
          SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS
        ] as number) >= 0,
        "reasoning_tokens should be a valid number",
      );
    }
  });
});
