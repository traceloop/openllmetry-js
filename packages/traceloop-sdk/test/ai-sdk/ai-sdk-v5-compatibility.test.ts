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
import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
} from "@opentelemetry/semantic-conventions/incubating";
import { transformLLMSpans, transformAiSdkSpanAttributes } from "../../src/lib/tracing/ai-sdk-transformations";

import { openai as vercel_openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
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

describe("AI SDK v5 Compatibility Tests", () => {
  describe("Unit Tests - Tool Schema Transformation", () => {
    it("should transform v4 format tools with 'parameters' property", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "getWeather",
            description: "Get weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Get weather for a location",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        JSON.stringify({
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        }),
      );
    });

    it("should transform v5 format tools with 'inputSchema' property", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "getWeather",
            description: "Get weather for a location",
            inputSchema: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Get weather for a location",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        JSON.stringify({
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        }),
      );
    });

    it("should prefer 'inputSchema' when both 'parameters' and 'inputSchema' exist", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "testTool",
            description: "Test tool with both properties",
            parameters: {
              type: "object",
              properties: { oldProp: { type: "string" } },
            },
            inputSchema: {
              type: "object",
              properties: { newProp: { type: "string" } },
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      const transformedParams = attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`];
      assert.ok(transformedParams);
      assert.ok(transformedParams.includes("newProp"));
      assert.ok(!transformedParams.includes("oldProp"));
    });

    it("should handle mixed v4 and v5 tools in the same array", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "v4Tool",
            description: "Tool using v4 format",
            parameters: {
              type: "object",
              properties: { v4Prop: { type: "string" } },
            },
          },
          {
            name: "v5Tool",
            description: "Tool using v5 format",
            inputSchema: {
              type: "object",
              properties: { v5Prop: { type: "string" } },
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "v4Tool",
      );
      const v4Params = attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`];
      assert.ok(v4Params.includes("v4Prop"));

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        "v5Tool",
      );
      const v5Params = attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.parameters`];
      assert.ok(v5Params.includes("v5Prop"));
    });
  });

  describe("Unit Tests - Tool Call Transformation", () => {
    it("should transform v4 format tool calls with 'args' property", () => {
      const attributes = {
        "ai.response.toolCalls": JSON.stringify([
          {
            toolCallType: "function",
            toolCallId: "call_123",
            toolName: "getWeather",
            args: '{"location": "San Francisco"}',
          },
        ]),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`gen_ai.completion.0.tool_calls.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`gen_ai.completion.0.tool_calls.0.arguments`],
        '{"location": "San Francisco"}',
      );
    });

    it("should transform v5 format tool calls with 'input' property", () => {
      const attributes = {
        "ai.response.toolCalls": JSON.stringify([
          {
            toolCallType: "function",
            toolCallId: "call_123",
            toolName: "getWeather",
            input: '{"location": "San Francisco"}',
          },
        ]),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`gen_ai.completion.0.tool_calls.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`gen_ai.completion.0.tool_calls.0.arguments`],
        '{"location": "San Francisco"}',
      );
    });

    it("should prefer 'input' over 'args' when both exist in tool calls", () => {
      const attributes = {
        "ai.response.toolCalls": JSON.stringify([
          {
            toolCallType: "function",
            toolCallId: "call_123",
            toolName: "getWeather",
            args: '{"location": "Old Value"}',
            input: '{"location": "New Value"}',
          },
        ]),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`gen_ai.completion.0.tool_calls.0.arguments`],
        '{"location": "New Value"}',
      );
    });

    it("should transform v4 tool call span attributes with 'args' and 'result'", () => {
      const attributes = {
        "ai.toolCall.name": "calculate",
        "ai.toolCall.id": "call_456",
        "ai.toolCall.args": '{"operation": "add", "a": 5, "b": 3}',
        "ai.toolCall.result": '{"result": 8}',
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_NAME],
        "calculate",
      );
      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
        '{"operation": "add", "a": 5, "b": 3}',
      );
      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        '{"result": 8}',
      );
    });

    it("should transform v5 tool call span attributes with 'input' and 'output'", () => {
      const attributes = {
        "ai.toolCall.name": "calculate",
        "ai.toolCall.id": "call_456",
        "ai.toolCall.input": '{"operation": "add", "a": 5, "b": 3}',
        "ai.toolCall.output": '{"result": 8}',
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_NAME],
        "calculate",
      );
      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
        '{"operation": "add", "a": 5, "b": 3}',
      );
      assert.strictEqual(
        attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        '{"result": 8}',
      );
    });

    it("should transform tool span and populate TRACELOOP_ENTITY_INPUT/OUTPUT with v5 format", () => {
      const span: ReadableSpan = {
        name: "calculate.tool",
        instrumentationScope: { name: "ai", version: "5.0.0" },
        attributes: {
          "ai.toolCall.name": "calculate",
          "ai.toolCall.input": '{"operation": "multiply", "a": 4, "b": 7}',
          "ai.toolCall.output": '{"result": 28}',
        },
        spanContext: () => ({ spanId: "test-span-id", traceId: "test-trace-id", traceFlags: 0 }),
        parentSpanContext: undefined,
        startTime: [0, 0],
        endTime: [0, 0],
        status: { code: 0 },
        duration: [0, 0],
        events: [],
        links: [],
        resource: {} as any,
        kind: 0,
        ended: true,
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
      };

      transformAiSdkSpanAttributes(span);

      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT],
        '{"operation": "multiply", "a": 4, "b": 7}',
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT],
        '{"result": 28}',
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        "tool",
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
        "calculate",
      );
      // v5 attributes should be cleaned up
      assert.strictEqual(span.attributes["ai.toolCall.input"], undefined);
      assert.strictEqual(span.attributes["ai.toolCall.output"], undefined);
      assert.strictEqual(span.attributes["ai.toolCall.name"], undefined);
    });

    it("should transform tool span and populate TRACELOOP_ENTITY_INPUT/OUTPUT with v4 format", () => {
      const span: ReadableSpan = {
        name: "calculate.tool",
        instrumentationScope: { name: "ai", version: "4.0.0" },
        attributes: {
          "ai.toolCall.name": "calculate",
          "ai.toolCall.args": '{"operation": "subtract", "a": 10, "b": 3}',
          "ai.toolCall.result": '{"result": 7}',
        },
        spanContext: () => ({ spanId: "test-span-id", traceId: "test-trace-id", traceFlags: 0 }),
        parentSpanContext: undefined,
        startTime: [0, 0],
        endTime: [0, 0],
        status: { code: 0 },
        duration: [0, 0],
        events: [],
        links: [],
        resource: {} as any,
        kind: 0,
        ended: true,
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
      };

      transformAiSdkSpanAttributes(span);

      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT],
        '{"operation": "subtract", "a": 10, "b": 3}',
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT],
        '{"result": 7}',
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        "tool",
      );
      // v4 attributes should be cleaned up
      assert.strictEqual(span.attributes["ai.toolCall.args"], undefined);
      assert.strictEqual(span.attributes["ai.toolCall.result"], undefined);
    });
  });

  describe("Integration Test - Real AI SDK v5 with Tools", function () {
    this.timeout(30000);

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
        process.env.OPENAI_API_KEY = "test";
      }
      initializeSharedTraceloop();
    });

    beforeEach(function () {
      const { server } = this.polly as Polly;
      server.any().on("beforePersist", (_req, recording) => {
        recording.request.headers = recording.request.headers.filter(
          ({ name }: { name: string }) =>
            !["authorization", "x-api-key"].includes(name.toLowerCase()),
        );
      });
    });

    afterEach(async () => {
      await traceloop.forceFlush();
      memoryExporter.reset();
    });

    it.skip("should capture tool schemas and tool calls correctly with AI SDK v5", async () => {
      const weatherTool = tool({
        description: "Get weather for a location",
        inputSchema: z.object({
          location: z.string().describe("Location to get weather for"),
        }),
        execute: async ({ location }) => {
          return {
            location,
            temperature: 72,
            condition: "sunny",
          };
        },
      });

      const result = await traceloop.withWorkflow(
        { name: "test_v5_tool_workflow" },
        async () => {
          return await generateText({
            model: vercel_openai("gpt-4o-mini"),
            prompt: "What's the weather in San Francisco?",
            tools: {
              getWeather: weatherTool,
            },
            maxSteps: 3,
            experimental_telemetry: {
              isEnabled: true,
            },
          });
        },
      );

      await traceloop.forceFlush();
      const spans = memoryExporter.getFinishedSpans();

      // Find the root AI span
      const rootSpan = spans.find((span) => span.name === "ai.generateText");
      assert.ok(rootSpan, "Root AI span should exist");

      // Verify tool schema was captured with 'parameters' attribute
      const toolSchemaParam = rootSpan.attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`];
      assert.ok(toolSchemaParam, "Tool schema should be captured");
      assert.strictEqual(
        rootSpan.attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );

      // Parse and verify the schema
      const schema = JSON.parse(toolSchemaParam as string);
      assert.ok(schema.properties, "Schema should have properties");
      assert.ok(schema.properties.location, "Schema should have location property");

      // Find tool call span
      const toolSpan = spans.find((span) => span.name === "getWeather.tool");
      if (toolSpan) {
        // Verify tool call input/output are captured
        assert.ok(
          toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT],
          "Tool span should have entity input",
        );
        assert.ok(
          toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT],
          "Tool span should have entity output",
        );
        assert.strictEqual(
          toolSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
          "tool",
        );
        assert.strictEqual(
          toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
          "getWeather",
        );
      }

      assert.ok(result);
      assert.ok(result.text);
    });
  });
});
