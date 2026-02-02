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
import { ATTR_GEN_AI_CONVERSATION_ID } from "@opentelemetry/semantic-conventions/incubating";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Conversation ID", () => {
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

  it("should set conversation ID using setConversationId", async () => {
    const conversationId = "conv_123";

    const result = await traceloop.setConversationId(
      conversationId,
      async () => {
        return await traceloop.withWorkflow(
          { name: "chat_workflow" },
          async () => {
            const chatCompletion = await openai.chat.completions.create({
              messages: [{ role: "user", content: "Hello!" }],
              model: "gpt-3.5-turbo",
            });

            return chatCompletion.choices[0].message.content;
          },
        );
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "chat_workflow.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    // Check that conversation ID is set on workflow span
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );

    // Check that conversation ID is propagated to LLM span
    assert.strictEqual(
      chatSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
  });

  it("should set conversation ID using withConversation", async () => {
    const conversationId = "conv_456";

    const result = await traceloop.withConversation(
      conversationId,
      async () => {
        return await traceloop.withWorkflow(
          { name: "chat_workflow_2" },
          async () => {
            const chatCompletion = await openai.chat.completions.create({
              messages: [{ role: "user", content: "Hi there!" }],
              model: "gpt-3.5-turbo",
            });

            return chatCompletion.choices[0].message.content;
          },
        );
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "chat_workflow_2.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
    assert.strictEqual(
      chatSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
  });

  it("should set conversation ID using decorator", async () => {
    const conversationId = "conv_789";

    class TestChat {
      @traceloop.conversation(conversationId)
      @traceloop.workflow({ name: "decorated_chat" })
      async chat(message: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: message }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testChat = new TestChat();
    const result = await testChat.chat("Tell me a joke");

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "decorated_chat.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
    assert.strictEqual(
      chatSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
  });

  it("should set dynamic conversation ID using decorator function", async () => {
    class TestChat {
      constructor(private conversationId: string) {}

      @traceloop.conversation((thisArg) => (thisArg as TestChat).conversationId)
      @traceloop.workflow({ name: "dynamic_conversation_chat" })
      async chat(message: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: message }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const conversationId = "conv_dynamic_123";
    const testChat = new TestChat(conversationId);
    const result = await testChat.chat("What is TypeScript?");

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "dynamic_conversation_chat.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
    assert.strictEqual(
      chatSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
  });

  it("should propagate conversation ID to nested tasks", async () => {
    const conversationId = "conv_nested_123";

    class TestChat {
      @traceloop.workflow({ name: "nested_workflow" })
      async chat(message: string) {
        return await this.processMessage(message);
      }

      @traceloop.task({ name: "process_message" })
      async processMessage(message: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: message }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testChat = new TestChat();
    const result = await traceloop.setConversationId(
      conversationId,
      async () => {
        return await testChat.chat("Hello nested!");
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "nested_workflow.workflow",
    );
    const taskSpan = spans.find((span) => span.name === "process_message.task");
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(taskSpan);
    assert.ok(chatSpan);

    // All spans should have the conversation ID
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
    assert.strictEqual(
      taskSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
    assert.strictEqual(
      chatSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
    );
  });

  it("should not mix conversation IDs for different conversations", async () => {
    class TestChat {
      @traceloop.workflow({ name: "chat" })
      async chat(message: string) {
        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: message }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      }
    }

    const testChat = new TestChat();

    // Run two conversations with different IDs
    const result1 = await traceloop.setConversationId(
      "conv_first",
      async () => {
        return await testChat.chat("First conversation");
      },
    );

    const result2 = await traceloop.setConversationId(
      "conv_second",
      async () => {
        return await testChat.chat("Second conversation");
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    assert.ok(result1);
    assert.ok(result2);

    const chat1Spans = spans.filter((span) =>
      (span.attributes[ATTR_GEN_AI_CONVERSATION_ID] as string)?.includes(
        "conv_first",
      ),
    );
    const chat2Spans = spans.filter((span) =>
      (span.attributes[ATTR_GEN_AI_CONVERSATION_ID] as string)?.includes(
        "conv_second",
      ),
    );

    // Each conversation should have its own spans with correct conversation ID
    assert.ok(chat1Spans.length > 0);
    assert.ok(chat2Spans.length > 0);

    chat1Spans.forEach((span) => {
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
        "conv_first",
      );
    });

    chat2Spans.forEach((span) => {
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
        "conv_second",
      );
    });
  }).timeout(30000);
});
