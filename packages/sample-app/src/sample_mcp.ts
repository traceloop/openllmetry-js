import * as traceloop from "@traceloop/node-server-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { z } from "zod";

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

  // For this demo, we'll use in-process communication via TransformStream
  // In production, you'd typically use stdio or HTTP transports

  const { readable: serverReadable, writable: serverWritable } =
    new TransformStream();
  const { readable: clientReadable, writable: clientWritable } =
    new TransformStream();

  // Create and connect the server
  const server = await createMCPServer();
  const serverTransport = new StdioServerTransport(
    serverReadable,
    clientWritable,
  );
  await server.connect(serverTransport);

  console.log("✓ MCP Server connected\n");

  // Create and connect the client
  const client = new Client(
    {
      name: "calculator-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  const clientTransport = new StdioClientTransport(
    clientReadable,
    serverWritable,
  );
  await client.connect(clientTransport);

  console.log("✓ MCP Client connected\n");

  // Demonstrate various MCP operations with tracing

  // 1. List available tools
  console.log("1. Listing available tools...");
  const tools = await client.listTools();
  console.log(`   Found ${tools.tools.length} tools:`);
  tools.tools.forEach((tool) => {
    console.log(`   - ${tool.name}: ${tool.description}`);
  });
  console.log();

  // 2. Call the add tool
  console.log("2. Calling 'add' tool with a=5, b=3...");
  const addResult = await client.callTool({
    name: "add",
    arguments: { a: 5, b: 3 },
  });
  console.log(
    `   Result: ${(addResult.content[0] as any).text}`,
  );
  console.log();

  // 3. Call the multiply tool
  console.log("3. Calling 'multiply' tool with x=4, y=7...");
  const multiplyResult = await client.callTool({
    name: "multiply",
    arguments: { x: 4, y: 7 },
  });
  console.log(
    `   Result: ${(multiplyResult.content[0] as any).text}`,
  );
  console.log();

  // 4. List resources
  console.log("4. Listing available resources...");
  const resources = await client.listResources();
  console.log(`   Found ${resources.resources.length} resources:`);
  resources.resources.forEach((resource) => {
    console.log(`   - ${resource.name} (${resource.uri})`);
  });
  console.log();

  // 5. Read a resource
  console.log("5. Reading 'calc://info' resource...");
  const resourceContent = await client.readResource({ uri: "calc://info" });
  console.log(
    `   Content: ${(resourceContent.contents[0] as any).text}`,
  );
  console.log();

  // Clean up
  await client.close();
  await server.close();

  console.log("✓ Sample completed successfully!");
  console.log(
    "\nCheck your Traceloop dashboard to see the traced MCP operations:",
  );
  console.log("- Session span for client connection");
  console.log("- Tool call spans for 'add' and 'multiply'");
  console.log("- Method spans for 'tools/list', 'resources/list', and 'resources/read'");

  // Give some time for traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
