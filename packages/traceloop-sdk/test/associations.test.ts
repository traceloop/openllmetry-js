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
import * as traceloop from "../src";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

describe("Test Associations API", () => {
  before(async function () {
    initializeSharedTraceloop();
  });

  afterEach(async () => {
    memoryExporter.reset();
  });

  it("should set a single association and propagate to spans", async () => {
    await traceloop.withAssociationProperties(
      {
        [traceloop.AssociationProperty.SESSION_ID]: "conv-123",
      },
      async () => {
        await traceloop.withWorkflow(
          { name: "test_single_association" },
          async () => {
            await traceloop.withTask({ name: "test_single_task" }, async () => {
              return;
            });
          },
        );
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0].name, "test_single_task.task");
    assert.strictEqual(spans[1].name, "test_single_association.workflow");

    const taskSpan = spans[0];
    const workflowSpan = spans[1];

    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "conv-123",
    );

    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "conv-123",
    );
  });

  it("should set multiple associations at once", async () => {
    await traceloop.withAssociationProperties(
      {
        [traceloop.AssociationProperty.USER_ID]: "user-456",
        [traceloop.AssociationProperty.SESSION_ID]: "session-789",
        [traceloop.AssociationProperty.CUSTOMER_ID]: "customer-999",
      },
      async () => {
        await traceloop.withWorkflow(
          { name: "test_multiple_associations" },
          async () => {
            await traceloop.withTask(
              { name: "test_multiple_task" },
              async () => {
                return;
              },
            );
          },
        );
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    const taskSpan = spans[0];
    const workflowSpan = spans[1];

    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-456",
    );
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-789",
    );
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.customer_id`
      ],
      "customer-999",
    );

    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-456",
    );
    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-789",
    );
    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.customer_id`
      ],
      "customer-999",
    );
  });

  it("should set associations via decorator associationProperties config", async () => {
    await traceloop.withWorkflow(
      {
        name: "test_decorator_associations",
        associationProperties: {
          [traceloop.AssociationProperty.SESSION_ID]: "conv-abc",
          [traceloop.AssociationProperty.USER_ID]: "user-xyz",
        },
      },
      async () => {
        await traceloop.withTask({ name: "test_within_task" }, async () => {
          return;
        });
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    const taskSpan = spans[0];
    const workflowSpan = spans[1];

    // Both spans should have the associations
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "conv-abc",
    );
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-xyz",
    );

    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "conv-abc",
    );
    assert.strictEqual(
      taskSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-xyz",
    );
  });

  it("should verify all AssociationProperty enum values work", async () => {
    await traceloop.withAssociationProperties(
      {
        [traceloop.AssociationProperty.SESSION_ID]: "session-1",
        [traceloop.AssociationProperty.CUSTOMER_ID]: "customer-2",
        [traceloop.AssociationProperty.USER_ID]: "user-3",
      },
      async () => {
        await traceloop.withWorkflow(
          { name: "test_all_properties" },
          async () => {
            return;
          },
        );
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    const workflowSpan = spans[0];

    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-1",
    );
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.customer_id`
      ],
      "customer-2",
    );
    assert.strictEqual(
      workflowSpan.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-3",
    );
  });

  it("should support nested withAssociationProperties with merged properties", async () => {
    await traceloop.withAssociationProperties(
      {
        [traceloop.AssociationProperty.SESSION_ID]: "session-outer",
      },
      async () => {
        await traceloop.withWorkflow({ name: "outer_workflow" }, async () => {
          await traceloop.withTask({ name: "task_1" }, async () => {
            return;
          });

          await traceloop.withAssociationProperties(
            {
              [traceloop.AssociationProperty.USER_ID]: "user-123",
            },
            async () => {
              await traceloop.withTask({ name: "task_2" }, async () => {
                return;
              });
            },
          );
        });
      },
    );

    await traceloop.forceFlush();
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);

    const task1Span = spans[0];
    const task2Span = spans[1];

    // task_1 should only have session_id
    assert.strictEqual(
      task1Span.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.session_id`
      ],
      "session-outer",
    );
    assert.strictEqual(
      task1Span.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      undefined,
    );

    // task_2 should have user_id from inner context
    assert.strictEqual(
      task2Span.attributes[
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.user_id`
      ],
      "user-123",
    );
  });
});
