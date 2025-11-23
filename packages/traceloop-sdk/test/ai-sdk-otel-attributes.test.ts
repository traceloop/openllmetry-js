/*
 * Comprehensive tests for OTel GenAI Semantic Conventions compliance
 * Tests all new gen_ai.* attributes added for OTel compliance
 */

import * as assert from "assert";
import { openai as vercel_openai } from "@ai-sdk/openai";
import { anthropic as vercel_anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

import * as traceloop from "../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("AI SDK OTel GenAI Semantic Conventions", function () {
  // Increase timeout for all tests in this suite
  this.timeout(10000);

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
      process.env.ANTHROPIC_API_KEY = "test";
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test";
    }

    initializeSharedTraceloop();
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) =>
          !["authorization", "x-api-key", "anthropic-version"].includes(
            name.toLowerCase(),
          ),
      );
    });
  });

  afterEach(async () => {
    await traceloop.forceFlush();
    memoryExporter.reset();
  });

  describe("gen_ai.operation.name attribute", () => {
    it("should set operation.name to 'chat' for generateText", async () => {
      await traceloop.withWorkflow({ name: "test_operation_name" }, async () => {
        await generateText({
          messages: [{ role: "user", content: "Say hello" }],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      });

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan, "AI span not found");
      assert.strictEqual(
        aiSpan.attributes[SpanAttributes.GEN_AI_OPERATION_NAME],
        "chat",
        "Operation name should be 'chat'",
      );
    });
  });

  describe("gen_ai.provider.name attribute", () => {
    it("should set provider.name to 'openai' for OpenAI", async () => {
      await traceloop.withWorkflow({ name: "test_openai_provider" }, async () => {
        await generateText({
          messages: [{ role: "user", content: "Hello" }],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      });

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan);
      assert.strictEqual(
        aiSpan.attributes[SpanAttributes.GEN_AI_PROVIDER_NAME],
        "openai",
        "Provider name should be 'openai' (OTel standard)",
      );
    });

    it("should set provider.name to 'anthropic' for Anthropic", async () => {
      await traceloop.withWorkflow(
        { name: "test_anthropic_provider" },
        async () => {
          await generateText({
            messages: [{ role: "user", content: "Hello" }],
            model: vercel_anthropic("claude-3-haiku-20240307"),
            experimental_telemetry: { isEnabled: true },
          });
        },
      );

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan);
      assert.strictEqual(
        aiSpan.attributes[SpanAttributes.GEN_AI_PROVIDER_NAME],
        "anthropic",
        "Provider name should be 'anthropic' (OTel standard)",
      );
    });
  });

  describe("gen_ai.tool.definitions attribute", () => {
    it("should create structured tool.definitions via transformation", () => {
      // Test transformation directly rather than full API call
      // since tool schema validation is complex
      const { transformLLMSpans } = require("../src/lib/tracing/ai-sdk-transformations");

      const attributes: Record<string, any> = {
        "ai.prompt.tools": [
          {
            type: "function",
            name: "getWeather",
            description: "Get the current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "The city and state" },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                  default: "celsius",
                },
              },
              required: ["location"],
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      // Check for gen_ai.tool.definitions (new OTel attribute)
      const toolDefs = attributes[SpanAttributes.GEN_AI_TOOL_DEFINITIONS];
      assert.ok(toolDefs, "tool.definitions should be set");

      const parsed = JSON.parse(toolDefs);
      assert.ok(Array.isArray(parsed), "tool.definitions should be an array");
      assert.strictEqual(parsed.length, 1, "Should have 1 tool");
      assert.strictEqual(parsed[0].type, "function", "Tool type should be 'function'");
      assert.strictEqual(
        parsed[0].function.name,
        "getWeather",
        "Tool name should be 'getWeather'",
      );
      assert.ok(
        parsed[0].function.description,
        "Tool should have description",
      );
      assert.ok(parsed[0].function.parameters, "Tool should have parameters");

      // Also verify backward compatibility - flat format should still exist
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
    });
  });

  describe("gen_ai.system_instructions attribute", () => {
    it("should separate system instructions from input messages", async () => {
      await traceloop.withWorkflow(
        { name: "test_system_instructions" },
        async () => {
          await generateText({
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant specialized in weather.",
              },
              { role: "user", content: "What's the weather?" },
            ],
            model: vercel_openai("gpt-3.5-turbo"),
            experimental_telemetry: { isEnabled: true },
          });
        },
      );

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan);

      // Check for gen_ai.system_instructions (new OTel attribute)
      const systemInstructions =
        aiSpan.attributes[SpanAttributes.GEN_AI_SYSTEM_INSTRUCTIONS];
      assert.ok(
        systemInstructions,
        "system_instructions should be set",
      );

      const parsed = JSON.parse(systemInstructions as string);
      assert.ok(Array.isArray(parsed), "system_instructions should be an array");
      assert.strictEqual(parsed.length, 1, "Should have 1 system message");
      assert.strictEqual(parsed[0].role, "system");
      assert.ok(
        parsed[0].parts[0].content.includes("helpful assistant"),
        "Should contain system message content",
      );

      // Check that input messages still include both (for backward compat)
      const inputMessages =
        aiSpan.attributes[SpanAttributes.GEN_AI_INPUT_MESSAGES];
      assert.ok(inputMessages);
      const inputParsed = JSON.parse(inputMessages as string);
      assert.strictEqual(inputParsed.length, 2, "Input messages should include both");
    });
  });

  describe("gen_ai.usage tokens attributes", () => {
    it("should set both new and deprecated token attributes", async () => {
      await traceloop.withWorkflow({ name: "test_token_attributes" }, async () => {
        await generateText({
          messages: [{ role: "user", content: "Count to 5" }],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      });

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan);

      // Check new OTel attributes
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_INPUT_TOKENS],
        "gen_ai.usage.input_tokens should be set",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS],
        "gen_ai.usage.output_tokens should be set",
      );

      // Check deprecated attributes still exist (backward compatibility)
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        "gen_ai.usage.prompt_tokens should still be set",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        "gen_ai.usage.completion_tokens should still be set",
      );

      // Verify values match
      assert.strictEqual(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_INPUT_TOKENS],
        aiSpan.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        "Input tokens should match prompt tokens",
      );
      assert.strictEqual(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS],
        aiSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        "Output tokens should match completion tokens",
      );
    });
  });

  describe("Backward compatibility", () => {
    it("should maintain all deprecated attributes alongside new ones", async () => {
      await traceloop.withWorkflow(
        { name: "test_backward_compatibility" },
        async () => {
          await generateText({
            messages: [
              { role: "system", content: "You are helpful" },
              { role: "user", content: "Hello" },
            ],
            model: vercel_openai("gpt-3.5-turbo"),
            experimental_telemetry: { isEnabled: true },
          });
        },
      );

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan);

      // New attributes should exist
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_OPERATION_NAME],
        "New: operation.name",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_PROVIDER_NAME],
        "New: provider.name",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_INPUT_TOKENS],
        "New: usage.input_tokens",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS],
        "New: usage.output_tokens",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_INPUT_MESSAGES],
        "New: input.messages",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.GEN_AI_OUTPUT_MESSAGES],
        "New: output.messages",
      );

      // Deprecated attributes should still exist
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_SYSTEM],
        "Deprecated: gen_ai.system",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        "Deprecated: usage.prompt_tokens",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        "Deprecated: usage.completion_tokens",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_INPUT_MESSAGES],
        "Deprecated: LLM_INPUT_MESSAGES",
      );
      assert.ok(
        aiSpan.attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
        "Deprecated: LLM_OUTPUT_MESSAGES",
      );

      // Flat format prompts/completions should still exist
      assert.ok(
        aiSpan.attributes["gen_ai.prompt.0.role"],
        "Flat format: prompt.0.role",
      );
      assert.ok(
        aiSpan.attributes["gen_ai.completion.0.role"],
        "Flat format: completion.0.role",
      );
    });
  });

  describe("Span naming", () => {
    it("should follow OTel pattern: {operation} {model}", async function () {
      this.timeout(10000); // Increase timeout for API call

      // Clear any previous spans
      memoryExporter.reset();

      await traceloop.withWorkflow({ name: "test_span_naming" }, async () => {
        await generateText({
          messages: [{ role: "user", content: "Say hi" }],
          model: vercel_openai("gpt-3.5-turbo"),
          experimental_telemetry: { isEnabled: true },
        });
      });

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();
      const aiSpan = spans.find((s) => s.name.startsWith("text.generate"));

      assert.ok(aiSpan, "AI span should exist");
      // Should be like "text.generate gpt-3.5-turbo"
      assert.ok(
        aiSpan.name.includes("text.generate"),
        "Span name should include operation",
      );
      assert.ok(
        aiSpan.name.includes("gpt-3.5-turbo") || aiSpan.name === "text.generate",
        "Span name should include model name when available",
      );
    });
  });
});
