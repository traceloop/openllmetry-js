import * as traceloop from "@traceloop/node-server-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { Readable, Writable } from "stream";

traceloop.initialize({
  appName: "sample_mcp",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

/**
 * This sample demonstrates MCP (Model Context Protocol) instrumentation
 * by creating a simple MCP server with tools and resources, then
 * connecting a client to interact with them.
 */

async function createMCPServer() {
  // Create an MCP server with a simple calculator tool
  const server = new Server(
    {
      name: "calculator-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register a tools/list handler
  server.setRequestHandler(
    z.object({
      method: z.literal("tools/list"),
    }),
    async () => ({
      tools: [
        {
          name: "add",
          description: "Add two numbers together",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number", description: "First number" },
              b: { type: "number", description: "Second number" },
            },
            required: ["a", "b"],
          },
        },
        {
          name: "multiply",
          description: "Multiply two numbers",
          inputSchema: {
            type: "object",
            properties: {
              x: { type: "number", description: "First number" },
              y: { type: "number", description: "Second number" },
            },
            required: ["x", "y"],
          },
        },
      ],
    }),
  );

  // Register a tools/call handler
  server.setRequestHandler(
    z.object({
      method: z.literal("tools/call"),
      params: z.object({
        name: z.string(),
        arguments: z.any(),
      }),
    }),
    async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "add") {
        const { a, b } = args;
        return {
          content: [
            {
              type: "text",
              text: String(a + b),
            },
          ],
        };
      } else if (name === "multiply") {
        const { x, y } = args;
        return {
          content: [
            {
              type: "text",
              text: String(x * y),
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    },
  );

  // Register a resources/list handler
  server.setRequestHandler(
    z.object({
      method: z.literal("resources/list"),
    }),
    async () => ({
      resources: [
        {
          uri: "calc://info",
          name: "Calculator Info",
          description: "Information about the calculator",
        },
      ],
    }),
  );

  // Register a resources/read handler
  server.setRequestHandler(
    z.object({
      method: z.literal("resources/read"),
      params: z.object({
        uri: z.string(),
      }),
    }),
    async (request) => {
      const { uri } = request.params;

      if (uri === "calc://info") {
        return {
          contents: [
            {
              uri: "calc://info",
              mimeType: "text/plain",
              text: "This is a simple calculator MCP server with add and multiply operations.",
            },
          ],
        };
      }

      return {
        contents: [],
      };
    },
  );

  return server;
}

async function main() {
  console.log("Starting MCP Sample Application...\n");

  // For this demo, we'll use in-process communication
  // In production, you'd typically use stdio or HTTP transports

  // Create mock stdin/stdout streams for in-process communication
  const serverToClient = new Readable({
    read() {
      // No-op for demonstration
    },
  });
  const clientToServer = new Writable({
    write(chunk, encoding, callback) {
      // Write from client to server
      serverToClient.push(chunk);
      callback();
    },
  });

  const clientFromServer = new Readable({
    read() {
      // No-op for demonstration
    },
  });
  const serverFromClient = new Writable({
    write(chunk, encoding, callback) {
      // Write from server to client
      clientFromServer.push(chunk);
      callback();
    },
  });

  // Create and connect the server
  const server = await createMCPServer();
  // Note: For this example to work, you'd need actual transport setup
  // The MCP SDK requires proper stdio transports
  // This is a simplified example showing the instrumentation structure

  console.log("✓ MCP Server ready\n");

  // Create the client
  const client = new Client(
    {
      name: "calculator-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  console.log("✓ MCP Client ready\n");

  // Unused variables for demonstration purposes
  void serverToClient;
  void clientToServer;
  void clientFromServer;
  void serverFromClient;
  void server;
  void client;

  // Note: This example shows the structure of MCP instrumentation
  // For a fully working example, you would need to:
  // 1. Set up proper transport mechanisms (stdio, SSE, HTTP)
  // 2. Connect the client and server through those transports
  // 3. Then make the actual tool calls

  console.log("MCP Instrumentation Example");
  console.log("===========================\n");
  console.log("This package instruments the following MCP operations:");
  console.log("- Client session lifecycle (mcp.client.session span)");
  console.log("- Tool invocations ({tool_name}.tool spans)");
  console.log("- Tool listing (tools/list.mcp spans)");
  console.log("- Resource operations (resources/read.mcp, resources/list.mcp spans)");
  console.log("- Prompt operations (prompts/get.mcp, prompts/list.mcp spans)\n");

  console.log("When you use MCP with this SDK, all operations are automatically traced!");
  console.log("\nExample trace structure:");
  console.log("  └─ mcp.client.session");
  console.log("      ├─ add_numbers.tool");
  console.log("      │   ├─ input: {tool_name: 'add_numbers', arguments: {a: 5, b: 3}}");
  console.log("      │   └─ output: {result: '8'}");
  console.log("      ├─ tools/list.mcp");
  console.log("      │   └─ output: {tools: [{name: 'add_numbers', ...}]}");
  console.log("      └─ resources/read.mcp");
  console.log("          ├─ input: {uri: 'calc://info'}");
  console.log("          └─ output: {contents: [{text: '...'}]}");
  console.log("\n✓ Instrumentation is active and ready!");

  // Give some time for traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
