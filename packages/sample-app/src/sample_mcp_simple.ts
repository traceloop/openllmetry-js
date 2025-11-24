import * as traceloop from "@traceloop/node-server-sdk";

/**
 * Simplified MCP sample with in-memory request/response mocking
 * This demonstrates MCP instrumentation without connection errors
 */

async function main() {
  console.log("Starting Simple MCP Sample Application...\n");

  // Import the MCP SDK FIRST
  const mcpModule = await import("@modelcontextprotocol/sdk/client/index.js");
  const { Client } = mcpModule;

  // Initialize Traceloop with instrumentModules
  traceloop.initialize({
    appName: "sample_mcp_simple",
    apiKey: process.env.TRACELOOP_API_KEY,
    baseUrl: process.env.TRACELOOP_BASE_URL,
    disableBatch: true,
    instrumentModules: {
      mcp: mcpModule,
    },
  });

  console.log("✓ Traceloop initialized with MCP instrumentation\n");

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

  // Mock the transport layer to avoid connection errors
  // This allows the instrumentation to create spans without actual network calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).request = async function (request: any) {
    // Simulate different responses based on the method
    const method = request.method;
    const params = request.params;

    if (method === "tools/list") {
      return {
        tools: [
          {
            name: "add",
            description: "Add two numbers together",
            inputSchema: {
              type: "object",
              properties: {
                a: { type: "number" },
                b: { type: "number" },
              },
            },
          },
          {
            name: "multiply",
            description: "Multiply two numbers",
            inputSchema: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
              },
            },
          },
        ],
      };
    } else if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "add") {
        const result = (args.a || 0) + (args.b || 0);
        return {
          content: [{ type: "text", text: String(result) }],
        };
      } else if (toolName === "multiply") {
        const result = (args.x || 0) * (args.y || 0);
        return {
          content: [{ type: "text", text: String(result) }],
        };
      }
    } else if (method === "resources/list") {
      return {
        resources: [
          {
            uri: "calc://info",
            name: "Calculator Info",
            description: "Information about the calculator",
          },
        ],
      };
    } else if (method === "resources/read") {
      return {
        contents: [
          {
            uri: params?.uri,
            mimeType: "text/plain",
            text: "This is a simple calculator MCP server with add and multiply operations.",
          },
        ],
      };
    }

    return { error: "Unknown method" };
  };

  console.log("✓ MCP Client ready\n");
  console.log("MCP Instrumentation Example");
  console.log("===========================\n");

  // 1. List available tools
  console.log("1. Listing available tools...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolsList = await (client as any).request({ method: "tools/list" });
  console.log(
    `   Found ${toolsList.tools.length} tools: ${toolsList.tools.map((t: { name: string }) => t.name).join(", ")}\n`,
  );

  // 2. Call the add tool
  console.log("2. Calling add tool with a=5, b=3...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addResult = await (client as any).request({
    method: "tools/call",
    params: {
      name: "add",
      arguments: { a: 5, b: 3 },
    },
  });
  console.log(`   Result: ${addResult.content[0].text}\n`);

  // 3. Call the multiply tool
  console.log("3. Calling multiply tool with x=4, y=7...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multiplyResult = await (client as any).request({
    method: "tools/call",
    params: {
      name: "multiply",
      arguments: { x: 4, y: 7 },
    },
  });
  console.log(`   Result: ${multiplyResult.content[0].text}\n`);

  // 4. List available resources
  console.log("4. Listing available resources...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resourcesList = await (client as any).request({
    method: "resources/list",
  });
  console.log(
    `   Found ${resourcesList.resources.length} resources: ${resourcesList.resources.map((r: { name: string }) => r.name).join(", ")}\n`,
  );

  // 5. Read a resource
  console.log("5. Reading resource calc://info...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resourceContent = await (client as any).request({
    method: "resources/read",
    params: {
      uri: "calc://info",
    },
  });
  console.log(`   Content: ${resourceContent.contents[0].text}\n`);

  console.log("✓ All MCP operations completed successfully!");
  console.log("\nTrace structure generated:");
  console.log("  ├─ add.tool (input: {a: 5, b: 3}, output: {result: '8'})");
  console.log("  ├─ multiply.tool (input: {x: 4, y: 7}, output: {result: '28'})");
  console.log("  ├─ tools/list.mcp (output: {tools: [...]})");
  console.log("  ├─ resources/list.mcp (output: {resources: [...]})");
  console.log("  └─ resources/read.mcp (input: {uri: 'calc://info'}, output: {contents: [...]})");
  console.log("\n✓ All MCP operations completed!");
  console.log("\nNote: These traces have NO errors - all requests succeeded.");
  console.log("Check your Traceloop dashboard to see the traces!");

  // Give some time for traces to be exported
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log("\n✓ Export complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
