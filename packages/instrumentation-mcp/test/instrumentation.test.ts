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
import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { McpInstrumentation } from "../src/instrumentation";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";

const memoryExporter = new InMemorySpanExporter();

describe("Test MCP instrumentation", function () {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: McpInstrumentation;
  let contextManager: AsyncHooksContextManager;

  before(async () => {
    instrumentation = new McpInstrumentation();
    instrumentation.setTracerProvider(provider);
    // Manually enable the instrumentation
    instrumentation.enable();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  after(() => {
    instrumentation.disable();
  });

  it("should successfully import MCP SDK Client", async () => {
    // Verify we can import the MCP SDK after instrumentation is set up
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    assert.ok(Client, "Should be able to import Client");
    assert.ok(Client.prototype.request, "Client should have request method");
    assert.ok(Client.prototype.connect, "Client should have connect method");
  });

  it("should successfully import MCP SDK Server", async () => {
    // Verify we can import the MCP SDK Server after instrumentation is set up
    const { Server } = await import(
      "@modelcontextprotocol/sdk/server/index.js"
    );
    assert.ok(Server, "Should be able to import Server");
    assert.ok(Server.prototype.request, "Server should have request method");
  });

  it("should respect traceContent config", async () => {
    // Create instrumentation with traceContent disabled
    instrumentation.setConfig({ traceContent: false });

    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Mock the request method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).request = async function (request: any) {
      if (request.method === "tools/call") {
        return {
          content: [
            {
              type: "text",
              text: "sensitive data",
            },
          ],
        };
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).request({
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: { data: "sensitive" },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const spans = memoryExporter.getFinishedSpans();
    const toolSpans = spans.filter((s) => s.name === "test_tool.tool");

    if (toolSpans.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolSpan = toolSpans[0] as any;
      // When traceContent is false, input/output should not be present
      assert.strictEqual(
        toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT],
        undefined,
      );
      assert.strictEqual(
        toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT],
        undefined,
      );
    }

    // Reset config
    instrumentation.setConfig({ traceContent: true });
  });

  it("should handle errors in tool calls", async () => {
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Mock the request method to return an error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).request = async function (request: any) {
      if (request.method === "tools/call") {
        return {
          content: [
            {
              type: "text",
              text: "Error: Something went wrong",
            },
          ],
          isError: true,
        };
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client as any).request({
      method: "tools/call",
      params: {
        name: "error_tool",
        arguments: {},
      },
    });

    assert.strictEqual(result.isError, true);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const spans = memoryExporter.getFinishedSpans();
    const toolSpans = spans.filter((s) => s.name === "error_tool.tool");

    if (toolSpans.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolSpan = toolSpans[0] as any;
      // Span should have error status
      assert.strictEqual(toolSpan.status.code, 2); // SpanStatusCode.ERROR
    }
  });

  it("should create session spans for client connect", async () => {
    const mcpModule = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const { InMemoryTransport } = await import(
      "@modelcontextprotocol/sdk/inMemory.js"
    );
    const { McpServer } = await import(
      "@modelcontextprotocol/sdk/server/mcp.js"
    );

    // Manually instrument the module
    instrumentation.manuallyInstrument(mcpModule);

    const { Client } = mcpModule;

    // Create a real transport pair
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    // Create a minimal server
    const server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: {} },
    );

    await server.connect(serverTransport);

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(clientTransport);
    await client.close();
    await server.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const spans = memoryExporter.getFinishedSpans();
    const sessionSpans = spans.filter((s) => s.name === "mcp.client.session");

    assert.ok(sessionSpans.length > 0, "Should create session span");
    const sessionSpan = sessionSpans[0];
    assert.strictEqual(
      sessionSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      TraceloopSpanKindValues.SESSION,
    );
    assert.strictEqual(
      sessionSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
      "mcp.client.session",
    );
  });

  it("should create tool call spans with correct attributes", async () => {
    const mcpModule = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const { InMemoryTransport } = await import(
      "@modelcontextprotocol/sdk/inMemory.js"
    );
    const { McpServer } = await import(
      "@modelcontextprotocol/sdk/server/mcp.js"
    );
    const { z } = await import("zod");

    // Manually instrument the module
    instrumentation.manuallyInstrument(mcpModule);

    const { Client } = mcpModule;

    // Create a real transport pair
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    // Create a server with a test tool
    const server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    server.registerTool(
      "test_tool",
      {
        description: "A test tool",
        inputSchema: {
          a: z.number(),
        },
      },
      async () => ({
        content: [{ type: "text", text: "result" }],
      }),
    );

    await server.connect(serverTransport);

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(clientTransport);

    // Make a tool call
    await client.callTool({ name: "test_tool", arguments: { a: 1 } });

    await client.close();
    await server.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const spans = memoryExporter.getFinishedSpans();
    const sessionSpans = spans.filter((s) => s.name === "mcp.client.session");
    const toolSpans = spans.filter((s) => s.name === "test_tool.tool");

    // Verify session span
    assert.ok(sessionSpans.length > 0, "Should create session span");
    const sessionSpan = sessionSpans[0];
    assert.strictEqual(
      sessionSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      TraceloopSpanKindValues.SESSION,
    );

    // Verify tool span
    assert.ok(toolSpans.length > 0, "Should create tool span");
    const toolSpan = toolSpans[0];
    assert.strictEqual(
      toolSpan.attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      TraceloopSpanKindValues.TOOL,
    );
    assert.strictEqual(
      toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME],
      "test_tool",
    );

    // Verify tool span has input/output (since traceContent is enabled by default)
    const input = JSON.parse(
      String(toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT] || "{}"),
    );
    assert.strictEqual(input.tool_name, "test_tool");
    assert.strictEqual(input.arguments?.a, 1);

    const output = JSON.parse(
      String(toolSpan.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT] || "{}"),
    );
    assert.strictEqual(output.result, "result");
  });
});
