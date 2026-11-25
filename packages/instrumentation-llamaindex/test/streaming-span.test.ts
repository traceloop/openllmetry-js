import * as assert from "assert";
import { context, SpanStatusCode } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { TraceloopSpanKindValues } from "@traceloop/ai-semantic-conventions";
import { generatorWrapper, genericWrapper } from "../src/utils";

describe("genericWrapper streaming span lifecycle", () => {
  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });

  beforeEach(() => {
    context.setGlobalContextManager(new AsyncHooksContextManager().enable());
    memoryExporter.reset();
  });

  afterEach(() => {
    context.disable();
  });

  async function startStream(
    source: () => AsyncGenerator<string, void, unknown>,
  ): Promise<AsyncGenerator<string, void, unknown>> {
    const wrapped = genericWrapper(
      "QueryEngine",
      "query",
      TraceloopSpanKindValues.WORKFLOW,
      () => provider.getTracer("test"),
      true,
    )(async () => source());
    return (await wrapped({ stream: true })) as AsyncGenerator<
      string,
      void,
      unknown
    >;
  }

  it("ends the span once with OK status when the stream completes", async () => {
    const stream = await startStream(async function* () {
      yield "a";
      yield "b";
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.deepStrictEqual(chunks, ["a", "b"]);
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
    assert.strictEqual(spans[0].events.length, 0);
  });

  it("ends the span with ERROR status and surfaces the error when the stream throws", async () => {
    const stream = await startStream(async function* () {
      yield "a";
      throw new Error("stream failed");
    });

    const chunks: string[] = [];
    let caught: Error | undefined;
    try {
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } catch (err) {
      caught = err as Error;
    }

    assert.deepStrictEqual(chunks, ["a"]);
    assert.strictEqual(caught?.message, "stream failed");
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, "stream failed");
    const exceptionEvents = spans[0].events.filter(
      (event) => event.name === "exception",
    );
    assert.strictEqual(exceptionEvents.length, 1);
    assert.strictEqual(
      exceptionEvents[0].attributes?.["exception.message"],
      "stream failed",
    );
  });

  const nonErrorThrows: Array<[string, unknown, string]> = [
    ["undefined", undefined, "undefined"],
    ["null", null, "null"],
    ["a string", "boom", "boom"],
    ["a plain object", { code: 42 }, "[object Object]"],
  ];

  for (const [label, thrown, expectedMessage] of nonErrorThrows) {
    it(`ends the span with ERROR status and rethrows the original value when the stream throws ${label}`, async () => {
      const stream = await startStream(async function* () {
        yield "a";
        throw thrown;
      });

      let caught: unknown = Symbol("not thrown");
      try {
        for await (const chunk of stream) {
          assert.strictEqual(chunk, "a");
        }
      } catch (err) {
        caught = err;
      }

      assert.strictEqual(caught, thrown);
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(spans[0].status.message, expectedMessage);
      const exceptionEvents = spans[0].events.filter(
        (event) => event.name === "exception",
      );
      assert.strictEqual(exceptionEvents.length, 1);
      assert.strictEqual(
        exceptionEvents[0].attributes?.["exception.message"],
        expectedMessage,
      );
    });
  }

  it("ends the span once when the consumer breaks early", async () => {
    let sourceFinalized = false;
    const stream = await startStream(async function* () {
      try {
        yield "a";
        yield "b";
        yield "c";
      } finally {
        sourceFinalized = true;
      }
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
      break;
    }

    assert.deepStrictEqual(chunks, ["a"]);
    assert.strictEqual(sourceFinalized, true);
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });
});

describe("generatorWrapper completion callback", () => {
  async function* failingSource(): AsyncGenerator<string> {
    yield "a";
    throw new Error("boom");
  }

  it("calls the callback once with the error when the stream throws", async () => {
    const calls: Array<Error | undefined> = [];
    const wrapped = generatorWrapper(failingSource(), context.active(), (err) =>
      calls.push(err),
    );

    await assert.rejects(async () => {
      for await (const chunk of wrapped) {
        assert.strictEqual(chunk, "a");
      }
    }, /boom/);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.message, "boom");
  });

  it("calls the callback once without an error when the consumer breaks", async () => {
    const calls: Array<Error | undefined> = [];
    async function* source(): AsyncGenerator<string> {
      yield "a";
      yield "b";
    }
    const wrapped = generatorWrapper(source(), context.active(), (err) =>
      calls.push(err),
    );

    for await (const chunk of wrapped) {
      assert.strictEqual(chunk, "a");
      break;
    }

    assert.deepStrictEqual(calls, [undefined]);
  });
});
