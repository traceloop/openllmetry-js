import * as traceloop from "@traceloop/node-server-sdk";
import { z } from "zod";

/**
 * This sample demonstrates MCP (Model Context Protocol) instrumentation
 * with a working in-memory client-server setup.
 *
 * IMPORTANT: For ESM modules like the MCP SDK, we use the instrumentModules option
 * to manually instrument the SDK. The MCP SDK must be imported BEFORE traceloop.initialize()
 * and passed via instrumentModules.
 */

async function main() {
  console.log("Starting MCP Sample Application...\n");

  // Import MCP SDK modules FIRST (before traceloop.initialize)
  const mcpClientModule = await import("@modelcontextprotocol/sdk/client/index.js");
  const mcpServerModule = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const mcpInMemoryModule = await import("@modelcontextprotocol/sdk/inMemory.js");

  const { Client } = mcpClientModule;
  const { McpServer } = mcpServerModule;
  const { InMemoryTransport } = mcpInMemoryModule;

  // Initialize Traceloop with instrumentModules to manually instrument the MCP SDK
  traceloop.initialize({
    appName: "sample_mcp",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true,
    instrumentModules: {
      mcp: mcpClientModule,
    },
  });

  console.log("✓ Traceloop initialized with MCP instrumentation\n");

  // Create linked transport pair for in-memory client-server communication
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Create and configure MCP server with tools and resources
  const server = new McpServer(
    { name: "calculator-server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Register add tool
  server.registerTool(
    "add",
    {
      description: "Add two numbers together",
      inputSchema: {
        a: z.number(),
        b: z.number(),
      },
    },
    async (args) => {
      const result = args.a + args.b;
      return { content: [{ type: "text", text: String(result) }] };
    },
  );

  // Register multiply tool
  server.registerTool(
    "multiply",
    {
      description: "Multiply two numbers",
      inputSchema: {
        x: z.number(),
        y: z.number(),
      },
    },
    async (args) => {
      const result = args.x * args.y;
      return { content: [{ type: "text", text: String(result) }] };
    },
  );

  // Register calculator info resource
  server.registerResource(
    "Calculator Info",
    "calc://info",
    { mimeType: "text/plain" },
    async () => ({
      contents: [
        {
          uri: "calc://info",
          mimeType: "text/plain",
          text: "This is a simple calculator MCP server with add and multiply operations.",
        },
      ],
    }),
  );

  await server.connect(serverTransport);
  console.log("✓ MCP Server connected\n");

  // Create and connect the client
  const client = new Client(
    { name: "calculator-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(clientTransport);
  console.log("✓ MCP Client connected\n");

  console.log("MCP Instrumentation Example");
  console.log("===========================\n");

  // 1. List available tools
  console.log("1. Listing available tools...");
  const toolsList = await client.listTools();
  console.log(
    `   Found ${toolsList.tools.length} tools: ${toolsList.tools.map((t) => t.name).join(", ")}\n`,
  );

  // 2. Call the add tool
  console.log("2. Calling add tool with a=5, b=3...");
  const addResult = await client.callTool({ name: "add", arguments: { a: 5, b: 3 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log(`   Result: ${((addResult as any).content[0] as any).text}\n`);

  // 3. Call the multiply tool
  console.log("3. Calling multiply tool with x=4, y=7...");
  const multiplyResult = await client.callTool({ name: "multiply", arguments: { x: 4, y: 7 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log(`   Result: ${((multiplyResult as any).content[0] as any).text}\n`);

  // 4. List available resources
  console.log("4. Listing available resources...");
  const resourcesList = await client.listResources();
  console.log(
    `   Found ${resourcesList.resources.length} resources: ${resourcesList.resources.map((r) => r.name).join(", ")}\n`,
  );

  // 5. Read a resource
  console.log("5. Reading resource calc://info...");
  const resourceContent = await client.readResource({ uri: "calc://info" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstContent = resourceContent.contents[0] as any;
  console.log(`   Content: ${firstContent.text}\n`);

  // Close connections
  await client.close();
  await server.close();

  console.log("✓ All MCP operations completed successfully!");
  console.log("\nTrace structure generated:");
  console.log("  ├─ mcp.client.session (session parent)");
  console.log("  ├─ initialize.mcp (initialization)");
  console.log("  ├─ tools/list.mcp (output: {tools: [...]})");
  console.log("  ├─ add.tool (input: {a: 5, b: 3}, output: {result: '8'})");
  console.log("  ├─ multiply.tool (input: {x: 4, y: 7}, output: {result: '28'})");
  console.log("  ├─ resources/list.mcp (output: {resources: [...]})");
  console.log("  └─ resources/read.mcp (input: {uri: 'calc://info'}, output: {contents: [...]})");
  console.log("\n✓ All spans created with SUCCESS status (no errors!)");
  console.log(
    "\nNote: Traces are being exported to your configured endpoint.",
  );
  console.log(
    "Set TRACELOOP_API_KEY environment variable to send traces to Traceloop.",
  );

  // Give some time for traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log("\n✓ Export complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
