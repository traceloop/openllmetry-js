import * as assert from "assert";
import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_GEN_AI_OUTPUT_MESSAGES } from "@opentelemetry/semantic-conventions/incubating";
import * as AnthropicModule from "@anthropic-ai/sdk";
import { AnthropicInstrumentation } from "../src/instrumentation";

const sse = (events: Record<string, unknown>[]) =>
  events
    .map((d) => `event: ${d.type}\ndata: ${JSON.stringify(d)}\n\n`)
    .join("");

const body = sse([
  {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-x",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  },
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "toolu_1", name: "f", input: {} },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: '{"ci' },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: 'ty":"Paris"}' },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 5 },
  },
  { type: "message_stop" },
]);

describe("Anthropic streaming accumulator wiring", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  let client: AnthropicModule.Anthropic;
  let contextManager: AsyncHooksContextManager;

  before(async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const instrumentation = new AnthropicInstrumentation();
    instrumentation.setTracerProvider(provider);
    const mod: typeof AnthropicModule = await import("@anthropic-ai/sdk");
    instrumentation.manuallyInstrument(mod);
    client = new mod.Anthropic({
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    exporter.reset();
  });

  afterEach(() => context.disable());

  it("records streamed tool_use arguments on the span", async () => {
    const stream = await client.messages.create({
      max_tokens: 10,
      model: "claude-x",
      stream: true,
      messages: [{ role: "user", content: "weather?" }],
    });
    for await (const chunk of stream) {
      void chunk;
    }

    const spans = exporter.getFinishedSpans();
    const span = spans[spans.length - 1];
    assert.ok(span);
    const output = JSON.parse(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
    );
    assert.deepStrictEqual(output[0].parts[0].arguments, { city: "Paris" });
  });
});
