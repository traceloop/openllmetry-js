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

import type * as OpenAIModule from "openai";

import * as traceloop from "../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_PROMPT,
  ATTR_GEN_AI_REQUEST_MODEL,
} from "@opentelemetry/semantic-conventions/incubating";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Agent Decorator", () => {
  let openai: OpenAIModule.OpenAI;

  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    recordFailedRequests: true,
    mode: process.env.RECORD_MODE === "NEW" ? "record" : "replay",
    matchRequestsBy: {
      headers: false,
      url: {
        protocol: true,
        hostname: true,
        pathname: true,
        query: false,
      },
    },
    logging: true,
  });

  before(async function () {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.OPENAI_API_KEY = "test";
    }

    // Use shared initialization to avoid conflicts with other test suites
    initializeSharedTraceloop();

    // Initialize OpenAI after Polly is set up
    const openAIModule: typeof OpenAIModule = await import("openai");
    openai = new openAIModule.OpenAI();
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "authorization",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
  });

  it("should create spans for agents using withAgent syntax", async () => {
    const jokeSubject = "OpenTelemetry";
    const result = await traceloop.withAgent(
      { name: "plan_trip", associationProperties: { userId: "123" } },
      async () => {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: `Tell me a joke about ${jokeSubject}` },
          ],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
      { jokeSubject },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const agentSpan = spans.find((span) => span.name === "plan_trip.agent");
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(agentSpan);
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "plan_trip",
    );
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "agent",
    );
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      "plan_trip",
    );
    assert.strictEqual(
      agentSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "plan_trip",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_AGENT_NAME}`],
      "plan_trip",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should create spans for agents using decoration syntax", async () => {
    class TestAgent {
      @traceloop.agent({ name: "travel_planner", version: 2 })
      async planTrip(destination: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: `Tell me a joke about OpenTelemetry` },
          ],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testAgent = new TestAgent();
    const result = await testAgent.planTrip("Paris");

    const spans = memoryExporter.getFinishedSpans();
    const agentSpan = spans.find(
      (span) => span.name === "travel_planner.agent",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(agentSpan);
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "travel_planner",
    );
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_SPAN_KIND}`],
      "agent",
    );
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_NAME}`],
      "travel_planner",
    );
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_ENTITY_VERSION}`],
      2,
    );
    assert.ok(chatSpan);
    assert.strictEqual(
      chatSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "travel_planner",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_AGENT_NAME}`],
      "travel_planner",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      chatSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });

  it("should propagate agent name to manual LLM instrumentation", async () => {
    const result = await traceloop.withAgent(
      { name: "assistant", associationProperties: { userId: "123" } },
      () =>
        traceloop.withLLMCall(
          { vendor: "openai", type: "chat" },
          async ({ span }) => {
            const messages: ChatCompletionMessageParam[] = [
              { role: "user", content: "Tell me a joke about OpenTelemetry" },
            ];
            const model = "gpt-3.5-turbo";

            span.reportRequest({ model, messages });

            const response = await openai.chat.completions.create({
              messages,
              model,
            });

            span.reportResponse(response);

            return response;
          },
        ),
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    const agentSpan = spans.find((span) => span.name === "assistant.agent");
    const completionSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(completionSpan);
    assert.ok(agentSpan);
    assert.strictEqual(
      agentSpan.attributes[`${SpanAttributes.TRACELOOP_WORKFLOW_NAME}`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.parentSpanContext?.spanId,
      agentSpan.spanContext().spanId,
    );
    assert.strictEqual(
      completionSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`
      ],
      "123",
    );
    assert.strictEqual(
      completionSpan.attributes[`${ATTR_GEN_AI_AGENT_NAME}`],
      "assistant",
    );
    assert.strictEqual(
      completionSpan.attributes[`${SpanAttributes.LLM_REQUEST_TYPE}`],
      "chat",
    );
    assert.strictEqual(
      completionSpan.attributes[`${ATTR_GEN_AI_REQUEST_MODEL}`],
      "gpt-3.5-turbo",
    );
    assert.strictEqual(
      completionSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.role`],
      "user",
    );
    assert.strictEqual(
      completionSpan.attributes[`${ATTR_GEN_AI_PROMPT}.0.content`],
      "Tell me a joke about OpenTelemetry",
    );
  });
});
