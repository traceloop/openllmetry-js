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

import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_GEN_AI_OUTPUT_MESSAGES } from "@opentelemetry/semantic-conventions/incubating";
import type {
  ContentBlock,
  Message,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

import { AnthropicInstrumentation } from "../src/instrumentation";
import {
  accumulateContentBlockEvent,
  flushPartialJson,
  PartialJsonBuffers,
} from "../src/stream-accumulator";

const toolUseStart = (index: number): MessageStreamEvent =>
  ({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: "toolu_01",
      name: "get_weather",
      input: {},
    },
  }) as MessageStreamEvent;

const jsonDelta = (index: number, partial_json: string): MessageStreamEvent =>
  ({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json },
  }) as MessageStreamEvent;

const stop = (index: number): MessageStreamEvent =>
  ({ type: "content_block_stop", index }) as MessageStreamEvent;

const thinkingStart = (index: number): MessageStreamEvent =>
  ({
    type: "content_block_start",
    index,
    content_block: { type: "thinking", thinking: "", signature: "" },
  }) as MessageStreamEvent;

const thinkingDelta = (index: number, thinking: string): MessageStreamEvent =>
  ({
    type: "content_block_delta",
    index,
    delta: { type: "thinking_delta", thinking },
  }) as MessageStreamEvent;

const fold = (events: MessageStreamEvent[]) => {
  const content: ContentBlock[] = [];
  const buffers: PartialJsonBuffers = new Map();
  for (const event of events) {
    accumulateContentBlockEvent(content, event, buffers);
  }
  flushPartialJson(content, buffers);
  return content;
};

const messageEnvelope = (
  blockEvents: MessageStreamEvent[],
): MessageStreamEvent[] => [
  {
    type: "message_start",
    message: { id: "msg_01", model: "claude", usage: {} },
  } as MessageStreamEvent,
  ...blockEvents,
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 5 },
  } as MessageStreamEvent,
  { type: "message_stop" } as MessageStreamEvent,
];

describe("Anthropic streaming content block accumulator", () => {
  it("rebuilds tool_use input from input_json_delta pieces split mid-token", () => {
    const content = fold(
      messageEnvelope([
        toolUseStart(0),
        jsonDelta(0, '{"ci'),
        jsonDelta(0, 'ty": "Pa'),
        jsonDelta(0, 'ris"}'),
        stop(0),
      ]),
    );

    assert.strictEqual(content.length, 1);
    assert.deepStrictEqual(content[0], {
      type: "tool_use",
      id: "toolu_01",
      name: "get_weather",
      input: { city: "Paris" },
    });
  });

  it("keeps the placeholder input for a tool call without arguments", () => {
    const content = fold([toolUseStart(0), jsonDelta(0, ""), stop(0)]);

    assert.deepStrictEqual((content[0] as any).input, {});
  });

  it("does not throw and keeps the placeholder input on invalid JSON", () => {
    const content = fold([
      toolUseStart(0),
      jsonDelta(0, '{"city": "Par'),
      stop(0),
    ]);

    assert.deepStrictEqual((content[0] as any).input, {});
  });

  it("parses a buffered tool call without a content_block_stop event", () => {
    const content = fold([toolUseStart(0), jsonDelta(0, '{"city":"Paris"}')]);

    assert.deepStrictEqual((content[0] as any).input, { city: "Paris" });
  });

  it("keeps the arguments of parallel tool calls apart", () => {
    const content = fold([
      toolUseStart(0),
      toolUseStart(1),
      jsonDelta(0, '{"city":'),
      jsonDelta(1, '{"city":"Rome"}'),
      jsonDelta(0, '"Paris"}'),
      stop(0),
      stop(1),
    ]);

    assert.deepStrictEqual((content[0] as any).input, { city: "Paris" });
    assert.deepStrictEqual((content[1] as any).input, { city: "Rome" });
  });

  it("does not leak a buffer from one tool call into the next", () => {
    const content = fold([
      toolUseStart(0),
      jsonDelta(0, '{"a":1}'),
      stop(0),
      toolUseStart(1),
      jsonDelta(1, '{"b":2}'),
      stop(1),
    ]);

    assert.deepStrictEqual((content[0] as any).input, { a: 1 });
    assert.deepStrictEqual((content[1] as any).input, { b: 2 });
  });

  it("concatenates thinking_delta pieces and keeps the signature", () => {
    const content = fold([
      thinkingStart(0),
      thinkingDelta(0, "Let me "),
      thinkingDelta(0, "think."),
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "sig" },
      } as MessageStreamEvent,
      stop(0),
    ]);

    assert.strictEqual((content[0] as any).thinking, "Let me think.");
    assert.strictEqual((content[0] as any).signature, "");
  });

  it("still concatenates text_delta pieces", () => {
    const content = fold([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "", citations: null },
      } as MessageStreamEvent,
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hel" },
      } as MessageStreamEvent,
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "lo" },
      } as MessageStreamEvent,
      stop(0),
    ]);

    assert.deepStrictEqual(content[0], {
      type: "text",
      text: "Hello",
      citations: null,
    });
  });

  it("emits streamed tool arguments and thinking in gen_ai.output.messages", () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const instrumentation = new AnthropicInstrumentation();
    instrumentation.setTracerProvider(provider);

    const content = fold(
      messageEnvelope([
        thinkingStart(0),
        thinkingDelta(0, "Need the "),
        thinkingDelta(0, "weather."),
        stop(0),
        toolUseStart(1),
        jsonDelta(1, '{"ci'),
        jsonDelta(1, 'ty":"Pa'),
        jsonDelta(1, 'ris"}'),
        stop(1),
      ]),
    );
    const result = {
      id: "msg_01",
      type: "message",
      model: "claude",
      role: "assistant",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 5 },
      content,
    } as unknown as Message;

    const span = provider.getTracer("test").startSpan("anthropic.chat");
    (instrumentation as any)._endSpan({ span, type: "chat", result });

    const [finished] = exporter.getFinishedSpans();
    const output = JSON.parse(
      finished.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.deepStrictEqual(output[0].parts, [
      { type: "reasoning", content: "Need the weather." },
      {
        type: "tool_call",
        id: "toolu_01",
        name: "get_weather",
        arguments: { city: "Paris" },
      },
    ]);
  });
});
