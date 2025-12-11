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
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Test Associations API", () => {
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

  it("should set single association on spans", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_single_association" },
      async () => {
        // Set a single association
        traceloop.Associations.set([
          [traceloop.AssociationProperty.CONVERSATION_ID, "conv-123"],
        ]);

        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "Tell me a joke" }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "test_single_association.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    // Check that the association is set on both workflow and LLM spans
    assert.strictEqual(
      workflowSpan.attributes["conversation_id"],
      "conv-123",
    );
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.conversation_id`
      ],
      "conv-123",
    );
  });

  it("should set multiple associations on spans", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_multiple_associations" },
      async () => {
        // Set multiple associations
        traceloop.Associations.set([
          [traceloop.AssociationProperty.USER_ID, "user-456"],
          [traceloop.AssociationProperty.SESSION_ID, "session-789"],
        ]);

        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "Tell me a fact" }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "test_multiple_associations.workflow",
    );
    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(workflowSpan);
    assert.ok(chatSpan);

    // Check that both associations are set
    assert.strictEqual(workflowSpan.attributes["user_id"], "user-456");
    assert.strictEqual(workflowSpan.attributes["session_id"], "session-789");
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-456",
    );
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-789",
    );
  });

  it("should allow updating associations mid-workflow", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_update_associations" },
      async () => {
        // Set initial association
        traceloop.Associations.set([
          [traceloop.AssociationProperty.SESSION_ID, "session-initial"],
        ]);

        const firstCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "First message" }],
          model: "gpt-3.5-turbo",
        });

        // Update association
        traceloop.Associations.set([
          [traceloop.AssociationProperty.SESSION_ID, "session-updated"],
        ]);

        const secondCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "Second message" }],
          model: "gpt-3.5-turbo",
        });

        return {
          first: firstCompletion.choices[0].message.content,
          second: secondCompletion.choices[0].message.content,
        };
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const firstChatSpan = spans.find(
      (span) =>
        span.name === "openai.chat" &&
        span.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`] ===
          "First message",
    );
    const secondChatSpan = spans.find(
      (span) =>
        span.name === "openai.chat" &&
        span.attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`] ===
          "Second message",
    );

    assert.ok(result);
    assert.ok(firstChatSpan);
    assert.ok(secondChatSpan);

    // First span should have initial value
    assert.strictEqual(
      firstChatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-initial",
    );

    // Second span should have updated value
    assert.strictEqual(
      secondChatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-updated",
    );
  });

  it("should work with all AssociationProperty types", async () => {
    const result = await traceloop.withWorkflow(
      { name: "test_all_property_types" },
      async () => {
        // Set all association property types
        traceloop.Associations.set([
          [traceloop.AssociationProperty.CONVERSATION_ID, "conv-abc"],
          [traceloop.AssociationProperty.CUSTOMER_ID, "customer-def"],
          [traceloop.AssociationProperty.USER_ID, "user-ghi"],
          [traceloop.AssociationProperty.SESSION_ID, "session-jkl"],
        ]);

        const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: "Test all properties" }],
          model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message.content;
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const chatSpan = spans.find((span) => span.name === "openai.chat");

    assert.ok(result);
    assert.ok(chatSpan);

    // Check all property types are set
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.conversation_id`
      ],
      "conv-abc",
    );
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.customer_id`
      ],
      "customer-def",
    );
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-ghi",
    );
    assert.strictEqual(
      chatSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-jkl",
    );
  });
});
