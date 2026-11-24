import * as assert from "assert";
import { Readable } from "stream";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import { Stream } from "cohere-ai/core/streaming-fetcher/Stream";
import { CohereInstrumentation } from "../src/instrumentation";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

const CHUNKS = [
  { eventType: "text-generation", text: "Hello" },
  { eventType: "text-generation", text: " world" },
  {
    eventType: "stream-end",
    response: {
      text: "Hello world",
      finishReason: "COMPLETE",
      token_count: { prompt_tokens: 7, response_tokens: 3, total_tokens: 10 },
    },
  },
];

function realCohereStream(items: any[], boom = false): any {
  const body = items.map((i) => JSON.stringify(i)).join("\n") + "\n";
  const src = boom
    ? new Readable({
        read() {
          this.push(Buffer.from(JSON.stringify(items[0]) + "\n"));
          this.destroy(new Error("boom mid-stream"));
        },
      })
    : Readable.from([Buffer.from(body)]);
  return new Stream({
    stream: src,
    parse: async (v: any) => v,
    eventShape: { type: "json", messageTerminator: "\n" },
  });
}

class CohereClient {
  async chatStream(req: any): Promise<any> {
    return realCohereStream(CHUNKS, !!req?.boom);
  }
  async generateStream(_r: any): Promise<any> {
    return realCohereStream([
      { eventType: "text-generation", text: "hi" },
      {
        eventType: "stream-end",
        response: {
          generations: [{ text: "hi", finish_reason: "COMPLETE" }],
          meta: { billedUnits: { inputTokens: 4, outputTokens: 2 } },
        },
      },
    ]);
  }
  async chat(_r: any) {
    return {};
  }
  async generate(_r: any) {
    return {};
  }
  async rerank(_r: any) {
    return {};
  }
}

const inst = new CohereInstrumentation();
inst.setTracerProvider(provider);
inst.manuallyInstrument({ CohereClient } as any);
const client: any = new CohereClient();

describe("Cohere streaming passthrough (hermetic)", () => {
  beforeEach(() => exporter.reset());

  it("chatStream yields every chunk to the consumer", async () => {
    const s = await client.chatStream({ message: "hi" });
    const got: any[] = [];
    for await (const m of s) got.push(m);
    assert.strictEqual(got.length, 3, "consumer must receive all 3 chunks");
    assert.strictEqual(got[0].text, "Hello");
    assert.strictEqual(got[2].eventType, "stream-end");
  });

  it("chatStream records usage attributes from stream-end", async () => {
    const s = await client.chatStream({ message: "hi" });
    for await (const _m of s) {
      /* drain */
    }
    const sp = exporter.getFinishedSpans();
    assert.strictEqual(sp.length, 1);
    assert.strictEqual(sp[0].attributes["gen_ai.usage.prompt_tokens"], 7);
    assert.strictEqual(sp[0].attributes["gen_ai.usage.completion_tokens"], 3);
    assert.strictEqual(sp[0].status.code, SpanStatusCode.OK);
  });

  it("generateStream yields every chunk to the consumer", async () => {
    const s = await client.generateStream({ prompt: "hi" });
    let n = 0;
    for await (const _m of s) n++;
    assert.strictEqual(n, 2, "consumer must receive all chunks");
  });

  it("mid-stream error sets ERROR status, records exception, ends span, rethrows", async () => {
    const s = await client.chatStream({ message: "hi", boom: true });
    await assert.rejects(async () => {
      for await (const _m of s) {
        /* drain */
      }
    }, /boom mid-stream/);
    const sp = exporter.getFinishedSpans();
    assert.strictEqual(sp.length, 1, "span must be ended on error");
    assert.strictEqual(sp[0].status.code, SpanStatusCode.ERROR);
    assert.ok(
      sp[0].events.some((e) => e.name === "exception"),
      "exception must be recorded",
    );
  });

  it("consumer breaking early still ends the span", async () => {
    const s = await client.chatStream({ message: "hi" });
    for await (const _m of s) break;
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(
      exporter.getFinishedSpans().length,
      1,
      "span must be ended when consumer abandons the stream",
    );
  });
});
