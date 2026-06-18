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
import { AIMessage } from "@langchain/core/messages";
import { LLMResult } from "@langchain/core/outputs";
import { Serialized } from "@langchain/core/load/serializable";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";

import { TraceloopCallbackHandler } from "../src/callback_handler";

// Per OTel GenAI semconv, cache_read.input_tokens and cache_creation.input_tokens
// SHOULD be included in gen_ai.usage.input_tokens (subset semantics).
//
// langchain-core's UsageMetadata contract documents input_tokens as
// "Sum of all input token types" — so it is already subset-correct.
// The handler must (1) emit cache_read / cache_creation attrs when present in
// usage_metadata.input_token_details, and (2) not double-count.

describe("LangChain cache token emission from usage_metadata", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer("test");
  const handler = new TraceloopCallbackHandler(tracer, true);

  afterEach(() => exporter.reset());

  const serializedLLM: Serialized = {
    lc: 1,
    type: "constructor",
    id: ["langchain", "chat_models", "anthropic", "ChatAnthropic"],
    kwargs: {},
  };

  const runChat = async (output: LLMResult): Promise<void> => {
    const runId = `run-${Math.random()}`;
    await handler.handleChatModelStart(serializedLLM, [[]], runId, undefined, {
      invocation_params: { model: "claude-3-5-sonnet" },
    });
    await handler.handleLLMEnd(output, runId);
  };

  const buildOutput = (usageMetadata: any): LLMResult => ({
    generations: [
      [
        {
          text: "hello",
          message: new AIMessage({
            content: "hello",
            usage_metadata: usageMetadata,
          }),
          generationInfo: { finish_reason: "end_turn" },
        } as any,
      ],
    ],
  });

  it("emits cache_read + cache_creation from usage_metadata.input_token_details, with input_tokens already a sum", async () => {
    // Per langchain-core contract, input_tokens=1200 already includes 900 cache_read + 200 cache_creation
    await runChat(
      buildOutput({
        input_tokens: 1200,
        output_tokens: 50,
        total_tokens: 1250,
        input_token_details: {
          cache_read: 900,
          cache_creation: 200,
        },
      }),
    );

    const span = exporter.getFinishedSpans().at(-1);
    assert.ok(span);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
      1200,
      "input_tokens preserved from usage_metadata (already subset)",
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 50);
    assert.strictEqual(
      span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      1250,
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      900,
      "cache_read.input_tokens should be emitted",
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      200,
      "cache_creation.input_tokens should be emitted",
    );
  });

  it("emits only cache_read when cache_creation is absent", async () => {
    await runChat(
      buildOutput({
        input_tokens: 1000,
        output_tokens: 50,
        total_tokens: 1050,
        input_token_details: {
          cache_read: 900,
        },
      }),
    );

    const span = exporter.getFinishedSpans().at(-1);
    assert.ok(span);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 1000);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      900,
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      undefined,
    );
  });

  it("does not emit cache attributes when input_token_details is absent", async () => {
    await runChat(
      buildOutput({
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      }),
    );

    const span = exporter.getFinishedSpans().at(-1);
    assert.ok(span);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      undefined,
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      undefined,
    );
  });

  it("falls back to llmOutput.tokenUsage when usage_metadata is absent (backwards compat)", async () => {
    const runId = `run-${Math.random()}`;
    await handler.handleChatModelStart(serializedLLM, [[]], runId, undefined, {
      invocation_params: { model: "gpt-4" },
    });
    await handler.handleLLMEnd(
      {
        generations: [
          [
            {
              text: "hello",
              message: new AIMessage({ content: "hello" }),
              generationInfo: { finish_reason: "stop" },
            } as any,
          ],
        ],
        llmOutput: {
          tokenUsage: {
            promptTokens: 1000,
            completionTokens: 50,
            totalTokens: 1050,
          },
        },
      },
      runId,
    );

    const span = exporter.getFinishedSpans().at(-1);
    assert.ok(span);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 1000);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 50);
    assert.strictEqual(
      span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
      1050,
    );
  });
});
