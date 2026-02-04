import * as assert from "assert";
import * as traceloop from "../src";
import { ATTR_GEN_AI_CONVERSATION_ID } from "@opentelemetry/semantic-conventions/incubating";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

describe("Test Conversation ID Unit Tests", () => {
  before(async function () {
    initializeSharedTraceloop();
  });

  afterEach(async () => {
    memoryExporter.reset();
  });

  it("should set conversation ID on workflow spans", async () => {
    const conversationId = "test_conv_123";

    await traceloop.setConversationId(conversationId, async () => {
      await traceloop.withWorkflow({ name: "test_workflow" }, async () => {
        // Simple workflow without external API calls
        return "result";
      });
    });

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "test_workflow.workflow",
    );

    assert.ok(workflowSpan, "Workflow span should exist");
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be set on workflow span",
    );
  });

  it("should set conversation ID using withConversation", async () => {
    const conversationId = "test_conv_456";

    await traceloop.withConversation(conversationId, async () => {
      await traceloop.withWorkflow({ name: "test_workflow_2" }, async () => {
        return "result";
      });
    });

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "test_workflow_2.workflow",
    );

    assert.ok(workflowSpan, "Workflow span should exist");
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be set on workflow span",
    );
  });

  it("should propagate conversation ID to nested tasks", async () => {
    const conversationId = "test_conv_nested";

    class TestClass {
      @traceloop.workflow({ name: "parent_workflow" })
      async parentWorkflow() {
        return await this.childTask();
      }

      @traceloop.task({ name: "child_task" })
      async childTask() {
        return "child_result";
      }
    }

    const instance = new TestClass();

    await traceloop.setConversationId(conversationId, async () => {
      await instance.parentWorkflow();
    });

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "parent_workflow.workflow",
    );
    const taskSpan = spans.find((span) => span.name === "child_task.task");

    assert.ok(workflowSpan, "Workflow span should exist");
    assert.ok(taskSpan, "Task span should exist");

    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be set on workflow span",
    );
    assert.strictEqual(
      taskSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be propagated to task span",
    );
  });

  it("should set conversation ID using decorator", async () => {
    const conversationId = "test_conv_decorator";

    class TestClass {
      @traceloop.conversation(conversationId)
      @traceloop.workflow({ name: "decorated_workflow" })
      async decoratedWorkflow() {
        return "result";
      }
    }

    const instance = new TestClass();
    await instance.decoratedWorkflow();

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "decorated_workflow.workflow",
    );

    assert.ok(workflowSpan, "Workflow span should exist");
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be set on workflow span",
    );
  });

  it("should set dynamic conversation ID using decorator function", async () => {
    class TestClass {
      constructor(private convId: string) {}

      @traceloop.conversation((thisArg) => (thisArg as TestClass).convId)
      @traceloop.workflow({ name: "dynamic_workflow" })
      async dynamicWorkflow() {
        return "result";
      }
    }

    const conversationId = "test_conv_dynamic";
    const instance = new TestClass(conversationId);
    await instance.dynamicWorkflow();

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflowSpan = spans.find(
      (span) => span.name === "dynamic_workflow.workflow",
    );

    assert.ok(workflowSpan, "Workflow span should exist");
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conversationId,
      "Conversation ID should be set on workflow span",
    );
  });

  it("should not mix conversation IDs between contexts", async () => {
    const conv1 = "conv_1";
    const conv2 = "conv_2";

    await traceloop.setConversationId(conv1, async () => {
      await traceloop.withWorkflow({ name: "workflow_1" }, async () => {
        return "result1";
      });
    });

    await traceloop.setConversationId(conv2, async () => {
      await traceloop.withWorkflow({ name: "workflow_2" }, async () => {
        return "result2";
      });
    });

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();

    const workflow1Span = spans.find(
      (span) => span.name === "workflow_1.workflow",
    );
    const workflow2Span = spans.find(
      (span) => span.name === "workflow_2.workflow",
    );

    assert.ok(workflow1Span, "Workflow 1 span should exist");
    assert.ok(workflow2Span, "Workflow 2 span should exist");

    assert.strictEqual(
      workflow1Span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conv1,
      "Workflow 1 should have conversation ID 1",
    );
    assert.strictEqual(
      workflow2Span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      conv2,
      "Workflow 2 should have conversation ID 2",
    );
  });
});
