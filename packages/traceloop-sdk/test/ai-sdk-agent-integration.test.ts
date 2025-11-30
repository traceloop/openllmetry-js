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
import { generateText, generateObject, streamText, tool } from "ai";
import { z } from "zod";
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

describe("Test AI SDK Agent Integration with Recording", function () {
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
      // Set dummy API keys for replay mode
      process.env.OPENAI_API_KEY = "test";
    }

    // Use shared initialization to avoid conflicts with other test suites
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

  it("should propagate agent name to tool call spans", async () => {
    // Define a simple calculator tool
    const calculate = tool({
      description: "Perform basic mathematical calculations",
      inputSchema: z.object({
        operation: z
          .enum(["add", "subtract", "multiply", "divide"])
          .describe("The mathematical operation to perform"),
        a: z.number().describe("First number"),
        b: z.number().describe("Second number"),
      }),
      execute: async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0) throw new Error("Division by zero");
            result = a / b;
            break;
        }
        return { operation, a, b, result };
      },
    });

    const result = await traceloop.withWorkflow(
      { name: "test_agent_tool_workflow" },
      async () => {
        return await generateText({
          model: vercel_openai("gpt-4o-mini"),
          prompt: "Calculate 5 + 3 using the calculator tool",
          tools: {
            calculate,
          },
          maxSteps: 5,
          experimental_telemetry: {
            isEnabled: true,
            functionId: "test_agent_function",
            metadata: {
              agent: "test_calculator_agent",
              sessionId: "test_session_123",
              userId: "test_user_456",
            },
          },
        });
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    // Find the root AI span (should now be named with agent name)
    const rootSpan = spans.find(
      (span) => span.name === "test_calculator_agent",
    );

    // Find tool call span
    const toolSpan = spans.find((span) => span.name.endsWith(".tool"));

    // Find child LLM span (text.generate)
    const childLLMSpan = spans.find(
      (span) => span.name === "text.generate" && span !== rootSpan,
    );

    assert.ok(result);
    assert.ok(
      rootSpan,
      "Root AI span should exist and be named with agent name",
    );

    // Verify root span has agent attributes
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
      "test_calculator_agent",
      "Root span should have agent name",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      "agent",
      "Root span should have span kind = agent",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
      "test_calculator_agent",
      "Root span should have entity name = agent name",
    );

    // Verify metadata was converted to association properties
    assert.strictEqual(
      rootSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.agent`
      ],
      "test_calculator_agent",
    );
    assert.strictEqual(
      rootSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.sessionId`
      ],
      "test_session_123",
    );
    assert.strictEqual(
      rootSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "test_user_456",
    );

    // Verify tool call span inherits agent name
    if (toolSpan) {
      assert.strictEqual(
        toolSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
        "test_calculator_agent",
        "Tool span should inherit agent name from parent",
      );
      assert.strictEqual(
        toolSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        "tool",
        "Tool span should have span kind = tool",
      );
      assert.ok(
        toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
        "Tool span should have entity name",
      );
    }

    // Verify child LLM span inherits agent name
    if (childLLMSpan) {
      assert.strictEqual(
        childLLMSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
        "test_calculator_agent",
        "Child LLM span should inherit agent name from parent",
      );
      // Child LLM span should NOT have span kind or entity name
      assert.strictEqual(
        childLLMSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        undefined,
        "Child LLM span should not have span kind",
      );
      assert.strictEqual(
        childLLMSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
        undefined,
        "Child LLM span should not have entity name",
      );
    }
  });

  it("should preserve original AI SDK span name when no agent metadata is provided", async () => {
    // Define a simple calculator tool
    const calculate = tool({
      description: "Perform basic mathematical calculations",
      inputSchema: z.object({
        operation: z
          .enum(["add", "subtract", "multiply", "divide"])
          .describe("The mathematical operation to perform"),
        a: z.number().describe("First number"),
        b: z.number().describe("Second number"),
      }),
      execute: async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0) throw new Error("Division by zero");
            result = a / b;
            break;
        }
        return { operation, a, b, result };
      },
    });

    const result = await traceloop.withWorkflow(
      { name: "test_no_agent_workflow" },
      async () => {
        return await generateText({
          model: vercel_openai("gpt-4o-mini"),
          prompt: "Calculate 10 + 5 using the calculator tool",
          tools: {
            calculate,
          },
          maxSteps: 5,
          experimental_telemetry: {
            isEnabled: true,
            functionId: "test_function_no_agent",
            // No agent metadata provided
            metadata: {
              sessionId: "test_session_no_agent",
            },
          },
        });
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    // Find the root AI span (should be "ai.generateText" when no agent metadata)
    const rootSpan = spans.find((span) => span.name === "ai.generateText");

    assert.ok(result);
    assert.ok(
      rootSpan,
      "Root AI span should exist and be named 'ai.generateText' when no agent metadata",
    );

    // Verify root span does NOT have agent attributes
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
      undefined,
      "Root span should not have agent name when no agent metadata",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      undefined,
      "Root span should not have span kind when no agent metadata",
    );
  });

  it("should use agent name for generateObject with agent metadata", async () => {
    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
      occupation: z.string(),
    });

    const result = await traceloop.withWorkflow(
      { name: "test_generate_object_agent_workflow" },
      async () => {
        return await generateObject({
          model: vercel_openai("gpt-4o-mini"),
          schema: PersonSchema,
          prompt: "Generate a person profile for a software engineer",
          experimental_telemetry: {
            isEnabled: true,
            functionId: "test_generate_object_function",
            metadata: {
              agent: "profile_generator_agent",
              sessionId: "test_session_object",
            },
          },
        });
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    // Find the root AI span (should be named with agent name)
    const rootSpan = spans.find(
      (span) => span.name === "profile_generator_agent",
    );

    assert.ok(result);
    assert.ok(
      rootSpan,
      "Root generateObject span should exist and be named with agent name",
    );

    // Verify root span has agent attributes
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
      "profile_generator_agent",
      "Root span should have agent name",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      "agent",
      "Root span should have span kind = agent",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
      "profile_generator_agent",
      "Root span should have entity name = agent name",
    );
  });

  it("should use agent name for streamText with agent metadata", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_stream_text_agent_workflow" },
      async () => {
        const stream = await streamText({
          model: vercel_openai("gpt-4o-mini"),
          prompt: "Write a short poem about AI",
          experimental_telemetry: {
            isEnabled: true,
            functionId: "test_stream_text_function",
            metadata: {
              agent: "poetry_agent",
              sessionId: "test_session_stream",
            },
          },
        });

        // Consume the stream to complete the operation
        let fullText = "";
        for await (const chunk of stream.textStream) {
          fullText += chunk;
        }

        return fullText;
      },
    );

    // Force flush to ensure all spans are exported
    await traceloop.forceFlush();

    const spans = memoryExporter.getFinishedSpans();

    // Find the root AI span (should be named with agent name)
    const rootSpan = spans.find((span) => span.name === "poetry_agent");

    assert.ok(result);
    assert.ok(
      rootSpan,
      "Root streamText span should exist and be named with agent name",
    );

    // Verify root span has agent attributes
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.GEN_AI_AGENT_NAME],
      "poetry_agent",
      "Root span should have agent name",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      "agent",
      "Root span should have span kind = agent",
    );
    assert.strictEqual(
      rootSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
      "poetry_agent",
      "Root span should have entity name = agent name",
    );
  });
});
