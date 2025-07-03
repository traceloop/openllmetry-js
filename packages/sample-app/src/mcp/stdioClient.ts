import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import * as traceloop from "@traceloop/node-server-sdk";
import * as sse from '@modelcontextprotocol/sdk/client/sse.js';
import * as stdio from '@modelcontextprotocol/sdk/client/stdio.js'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const initStdioClient = async () => {
  
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
  const stdioClient = new Client({
    name: 'example-client',
    version: '1.0.0'
  });
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/mcp/stdioServer.js']
  });
  await stdioClient.connect(transport);
  stdioClient.listPrompts().then((prompts) => {
    console.log(prompts);
  });
  return stdioClient;
};

initStdioClient()