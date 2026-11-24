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

import { context, SpanStatusCode } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import * as assert from "assert";
import * as http from "http";
import * as zlib from "zlib";
import * as bedrockModule from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";
import { BedrockInstrumentation } from "../src/instrumentation";

const memoryExporter = new InMemorySpanExporter();

const eventStreamHeader = (name: string, value: string) => {
  const nameBytes = Buffer.from(name);
  const valueBytes = Buffer.from(value);
  const header = Buffer.alloc(4 + nameBytes.length + valueBytes.length);
  header.writeUInt8(nameBytes.length, 0);
  nameBytes.copy(header, 1);
  header.writeUInt8(7, 1 + nameBytes.length);
  header.writeUInt16BE(valueBytes.length, 2 + nameBytes.length);
  valueBytes.copy(header, 4 + nameBytes.length);
  return header;
};

const chunkFrame = (payload: object) => {
  const headers = Buffer.concat([
    eventStreamHeader(":event-type", "chunk"),
    eventStreamHeader(":content-type", "application/json"),
    eventStreamHeader(":message-type", "event"),
  ]);
  const body = Buffer.from(
    JSON.stringify({
      bytes: Buffer.from(JSON.stringify(payload)).toString("base64"),
    }),
  );
  const prelude = Buffer.alloc(8);
  prelude.writeUInt32BE(16 + headers.length + body.length, 0);
  prelude.writeUInt32BE(headers.length, 4);
  const preludeCrc = Buffer.alloc(4);
  preludeCrc.writeUInt32BE(zlib.crc32(prelude));
  const message = Buffer.concat([prelude, preludeCrc, headers, body]);
  const messageCrc = Buffer.alloc(4);
  messageCrc.writeUInt32BE(zlib.crc32(message));
  return Buffer.concat([message, messageCrc]);
};

const titanChunks = [
  { outputText: "north, ", index: 0 },
  { outputText: "south, ", index: 1 },
  {
    outputText: "east and west",
    index: 2,
    completionReason: "FINISH",
    inputTextTokenCount: 7,
    totalOutputTextTokenCount: 5,
    "amazon-bedrock-invocationMetrics": {
      inputTokenCount: 7,
      outputTokenCount: 5,
    },
  },
];

describe("Bedrock streaming responses reach the caller", () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  let instrumentation: BedrockInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let bedrock: typeof bedrockModule;
  let server: http.Server;
  let client: bedrockModule.BedrockRuntimeClient;
  let failMidStream = false;

  before(async () => {
    instrumentation = new BedrockInstrumentation();
    instrumentation.setTracerProvider(provider);
    bedrock = await import("@aws-sdk/client-bedrock-runtime");

    server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/vnd.amazon.eventstream",
      });
      const frames = failMidStream ? titanChunks.slice(0, 1) : titanChunks;
      let sent = 0;
      const timer = setInterval(() => {
        if (sent < frames.length) {
          res.write(chunkFrame(frames[sent++]));
        } else {
          clearInterval(timer);
          if (failMidStream) {
            res.destroy();
          } else {
            res.end();
          }
        }
      }, 20);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = server.address() as { port: number };

    client = new bedrock.BedrockRuntimeClient({
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
      endpoint: `http://127.0.0.1:${port}`,
      requestHandler: new NodeHttpHandler(),
    });
  });

  after(() => {
    instrumentation.disable();
    server.close();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    failMidStream = false;
    memoryExporter.reset();
    context.disable();
  });

  const send = () =>
    client.send(
      new bedrock.InvokeModelWithResponseStreamCommand({
        modelId: "amazon.titan-text-express-v1",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: "Name the cardinal directions" }),
      }),
    );

  it("delivers every chunk to the caller and ends the span once the stream is consumed", async () => {
    const response = await send();

    const received: unknown[] = [];
    for await (const value of response.body!) {
      received.push(JSON.parse(new TextDecoder().decode(value.chunk?.bytes)));
    }

    assert.deepStrictEqual(received, titanChunks);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
    assert.strictEqual(spans[0].attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 7);
    assert.strictEqual(spans[0].attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
    assert.strictEqual(
      spans[0].attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      12,
    );
  });
  it("ends the span when the caller stops consuming the stream early", async () => {
    const response = await send();

    const received: unknown[] = [];
    for await (const value of response.body!) {
      received.push(JSON.parse(new TextDecoder().decode(value.chunk?.bytes)));
      break;
    }

    assert.strictEqual(received.length, 1);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });

  it("records an error on the span when the stream fails mid-way", async () => {
    failMidStream = true;
    const response = await send();

    await assert.rejects(async () => {
      for await (const value of response.body!) {
        assert.ok(value.chunk);
      }
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.ok(spans[0].events.some((e) => e.name === "exception"));
  });
});
