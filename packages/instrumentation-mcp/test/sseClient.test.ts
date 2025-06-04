import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import { context } from "@opentelemetry/api";
import FSPersister from "@pollyjs/persister-fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as assert from "assert";

import { McpInstrumentation } from "../src/instrumentation";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import * as sse from "@modelcontextprotocol/sdk/client/sse.js";
import * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import app from "./sseExpressServer";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

describe("Test MCP SSE Client", () => {
  const provider = new BasicTracerProvider();
  let instrumentation: McpInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let sseModule: typeof sse;
  let stdioModule: typeof stdio;

  setupPolly({
    adapters: ["node-http"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
    },
  });

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new McpInstrumentation();
    instrumentation.setTracerProvider(provider);

    sseModule = require("@modelcontextprotocol/sdk/client/sse.js");
    stdioModule = require("@modelcontextprotocol/sdk/client/stdio.js");

    instrumentation.manuallyInstrument(sseModule, stdioModule);

    app.listen(3001, () => {
      console.error(`Server is running on port 3001`);
    });
  });

  beforeEach(function () {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
  });

  it("should fetch prompts", async () => {
    const sseClient = new Client({
      name: "example-client",
      version: "1.0.0",
    });
    const url = new URL("http://localhost:3001/sse");
    const transport = new SSEClientTransport(url);
    await sseClient.connect(transport);
    await sseClient.listPrompts();
    const spans = memoryExporter.getFinishedSpans();
    
    const connectionInitSpan = spans.find(
      (span) => span.attributes?.["mcp.request.method"] === "initialize",
    );
    assert.ok(connectionInitSpan);
    
    const promptsListSpan = spans.find(
      (span) => span.attributes?.["mcp.request.method"] === "prompts/list",
    );
    assert.ok(promptsListSpan);

    sseClient.close();
  });
});
