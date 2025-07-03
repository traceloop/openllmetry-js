import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import * as traceloop from "@traceloop/node-server-sdk";
import * as sse from '@modelcontextprotocol/sdk/client/sse.js';
import * as stdio from '@modelcontextprotocol/sdk/client/stdio.js'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const initSseClient = async () => {
  const consoleExporter = new ConsoleSpanExporter();

  traceloop.initialize({
    apiKey: process.env.TRACELOOP_API_KEY,
    instrumentModules: {
      mcp: {
        sseModule: sse,
        stdioModule: stdio
      }
    },
    exporter: consoleExporter
  });
  const sseClient = new Client({
    name: 'example-client',
    version: '1.0.0'
  });
  const url = new URL('http://localhost:3001/sse');
  const transport = new SSEClientTransport(url);
  await sseClient.connect(transport);
  sseClient.listPrompts().then((prompts) => {
    console.log(prompts);
  });
  return sseClient;
};

initSseClient()
