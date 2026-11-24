import * as assert from "assert";
import { SpanStatusCode } from "@opentelemetry/api";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import * as traceloop from "../src";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { getTracer } from "../src/lib/tracing/tracing";
import { initializeSharedTraceloop, getSharedExporter } from "./test-setup";

const memoryExporter = getSharedExporter();

const getSpans = async (name: string): Promise<ReadableSpan[]> => {
  await traceloop.forceFlush();
  return memoryExporter.getFinishedSpans().filter((s) => s.name === name);
};

const assertErroredSpan = (spans: ReadableSpan[], message: string) => {
  assert.strictEqual(spans.length, 1, "exactly one finished span expected");
  const span = spans[0];
  assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  assert.strictEqual(span.status.message, message);
  const exceptions = span.events.filter((e) => e.name === "exception");
  assert.strictEqual(exceptions.length, 1);
  assert.strictEqual(exceptions[0].attributes?.["exception.message"], message);
};

describe("Test Decorator Error Handling", () => {
  const endCalls = new Map<string, number>();
  let spanPrototype: { end: (...args: unknown[]) => void };
  let originalEnd: (...args: unknown[]) => void;

  before(async function () {
    initializeSharedTraceloop();
    const probe = getTracer().startSpan("decorators_errors_probe");
    spanPrototype = Object.getPrototypeOf(probe);
    probe.end();
    originalEnd = spanPrototype.end;
    spanPrototype.end = function (this: { name: string }, ...args: unknown[]) {
      endCalls.set(this.name, (endCalls.get(this.name) ?? 0) + 1);
      return originalEnd.apply(this, args);
    };
  });

  after(() => {
    spanPrototype.end = originalEnd;
  });

  afterEach(async () => {
    memoryExporter.reset();
    endCalls.clear();
  });

  it("should end and mark the workflow span as error when an async function throws", async () => {
    const error = new Error("async workflow boom");

    await assert.rejects(
      traceloop.withWorkflow({ name: "err_async_workflow" }, async () => {
        throw error;
      }),
      (caught) => caught === error,
    );

    assertErroredSpan(
      await getSpans("err_async_workflow.workflow"),
      "async workflow boom",
    );
  });

  it("should end and mark the workflow span as error when a sync function throws", async () => {
    const error = new Error("sync workflow boom");

    await assert.rejects(
      traceloop.withWorkflow({ name: "err_sync_workflow" }, () => {
        throw error;
      }),
      (caught) => caught === error,
    );

    assertErroredSpan(
      await getSpans("err_sync_workflow.workflow"),
      "sync workflow boom",
    );
  });

  it("should end and mark the workflow span as error when a function returns a rejected promise", async () => {
    const error = new Error("rejected workflow boom");

    await assert.rejects(
      traceloop.withWorkflow({ name: "err_rejected_workflow" }, () =>
        Promise.reject(error),
      ),
      (caught) => caught === error,
    );

    assertErroredSpan(
      await getSpans("err_rejected_workflow.workflow"),
      "rejected workflow boom",
    );
  });

  it("should end and mark the task span as error and keep the parent workflow ok when the workflow handles it", async () => {
    const error = new Error("task boom");

    await traceloop.withWorkflow({ name: "err_parent_workflow" }, async () => {
      await assert.rejects(
        traceloop.withTask({ name: "err_task" }, async () => {
          throw error;
        }),
        (caught) => caught === error,
      );
    });

    assertErroredSpan(await getSpans("err_task.task"), "task boom");
    const [workflow] = await getSpans("err_parent_workflow.workflow");
    assert.ok(workflow, "workflow span should be finished");
    assert.notStrictEqual(workflow.status.code, SpanStatusCode.ERROR);
  });

  it("should mark both spans as error when a task error propagates through the workflow", async () => {
    const error = new Error("propagated boom");

    await assert.rejects(
      traceloop.withWorkflow({ name: "err_outer_workflow" }, async () => {
        await traceloop.withTask({ name: "err_inner_task" }, () => {
          throw error;
        });
      }),
      (caught) => caught === error,
    );

    assertErroredSpan(await getSpans("err_inner_task.task"), "propagated boom");
    assertErroredSpan(
      await getSpans("err_outer_workflow.workflow"),
      "propagated boom",
    );
  });

  it("should end and mark agent and tool spans as error", async () => {
    const error = new Error("entity boom");

    await assert.rejects(
      traceloop.withAgent({ name: "err_agent" }, async () => {
        throw error;
      }),
      (caught) => caught === error,
    );
    await assert.rejects(
      traceloop.withTool({ name: "err_tool" }, () => {
        throw error;
      }),
      (caught) => caught === error,
    );

    assertErroredSpan(await getSpans("err_agent.agent"), "entity boom");
    assertErroredSpan(await getSpans("err_tool.tool"), "entity boom");
  });

  it("should end and mark the span as error for decorated methods", async () => {
    const error = new Error("decorated boom");

    class Service {
      @traceloop.workflow({ name: "err_decorated_async" })
      async failAsync() {
        throw error;
      }

      @traceloop.task({ name: "err_decorated_sync" })
      failSync() {
        throw error;
      }
    }

    const service = new Service();
    await assert.rejects(service.failAsync(), (caught) => caught === error);
    await assert.rejects(
      async () => service.failSync(),
      (caught) => caught === error,
    );

    assertErroredSpan(
      await getSpans("err_decorated_async.workflow"),
      "decorated boom",
    );
    assertErroredSpan(
      await getSpans("err_decorated_sync.task"),
      "decorated boom",
    );
  });

  it("should end each span exactly once on every path", async () => {
    await assert.rejects(
      traceloop.withWorkflow({ name: "once_async" }, async () => {
        throw new Error("x");
      }),
    );
    await assert.rejects(
      traceloop.withWorkflow({ name: "once_sync" }, () => {
        throw new Error("x");
      }),
    );
    await assert.rejects(
      traceloop.withWorkflow({ name: "once_rejected" }, () =>
        Promise.reject(new Error("x")),
      ),
    );
    await traceloop.withWorkflow({ name: "once_ok" }, async () => "ok");
    await traceloop.withWorkflow({ name: "once_ok_sync" }, () => "ok");

    for (const name of [
      "once_async",
      "once_sync",
      "once_rejected",
      "once_ok",
      "once_ok_sync",
    ]) {
      assert.strictEqual(endCalls.get(`${name}.workflow`), 1, name);
    }
  });

  it("should record non-Error rejections as an error span", async () => {
    await assert.rejects(
      traceloop.withWorkflow({ name: "err_string_workflow" }, async () => {
        throw "plain string failure";
      }),
      (caught) => caught === "plain string failure",
    );

    const spans = await getSpans("err_string_workflow.workflow");
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(
      spans[0].events.filter((e) => e.name === "exception").length,
      1,
    );
  });

  it("should keep the success path unchanged", async () => {
    const result = await traceloop.withWorkflow(
      { name: "ok_workflow" },
      async () => "fine",
    );
    const syncResult = await traceloop.withTask({ name: "ok_task" }, () => 42);

    assert.strictEqual(result, "fine");
    assert.strictEqual(syncResult, 42);

    const workflows = await getSpans("ok_workflow.workflow");
    const tasks = await getSpans("ok_task.task");
    assert.strictEqual(workflows.length, 1);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(workflows[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(tasks[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(workflows[0].events.length, 0);
    assert.strictEqual(tasks[0].events.length, 0);
    assert.strictEqual(
      workflows[0].attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
      "workflow",
    );
  });
});
