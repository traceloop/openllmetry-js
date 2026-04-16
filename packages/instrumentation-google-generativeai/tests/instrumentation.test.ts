import { context, SpanStatusCode } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import * as assert from "assert";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
} from "@opentelemetry/semantic-conventions/incubating";
import {
  SpanAttributes,
  CONTEXT_KEY_ALLOW_TRACE_CONTENT,
} from "@traceloop/ai-semantic-conventions";
import { GenAIInstrumentation } from "../src/instrumentation";
// Type alias for mock GoogleGenAI instances used in tests
type MockGenAILike = {
  models: {
    generateContent: (
      params: import("@google/genai").GenerateContentParameters,
    ) => Promise<import("@google/genai").GenerateContentResponse>;
    generateContentStream: (
      params: import("@google/genai").GenerateContentParameters,
    ) => Promise<
      AsyncGenerator<import("@google/genai").GenerateContentResponse>
    >;
  };
};

// Type alias for accessing private wrap/unwrap methods in tests
type InstrumentationWithPrivateMethods = {
  wrap: (module: typeof import("@google/genai"), version?: string) => void;
  unwrap: (module: typeof import("@google/genai")) => void;
};

// ---------------------------------------------------------------------------
// Mock @google/genai module
// ---------------------------------------------------------------------------

function makeMockGenAIModule(options: {
  responseText?: string;
  finishReason?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  modelVersion?: string;
  responseId?: string;
}) {
  const {
    responseText = "Hello from Gemini!",
    finishReason = "STOP",
    promptTokens = 10,
    candidatesTokens = 5,
    totalTokens = 15,
    modelVersion = "gemini-2.0-flash",
    responseId = "resp-test-123",
  } = options;

  const mockResponse = {
    candidates: [
      {
        content: { role: "model", parts: [{ text: responseText }] },
        finishReason,
      },
    ],
    usageMetadata: {
      promptTokenCount: promptTokens,
      candidatesTokenCount: candidatesTokens,
      totalTokenCount: totalTokens,
    },
    modelVersion,
    responseId,
  };

  class MockGoogleGenAI {
    models = {
      generateContent: async () => mockResponse,
      generateContentStream: async () =>
        (async function* () {
          yield mockResponse;
        })(),
    };
  }

  return { GoogleGenAI: MockGoogleGenAI };
}

/**
 * Creates a mock module whose response has custom candidate parts.
 * Useful for testing function call, thinking, and image output shapes.
 */
function makeMockGenAIModuleWithParts(parts: Record<string, unknown>[]) {
  const mockResponse = {
    candidates: [
      {
        content: { role: "model", parts },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
    modelVersion: "gemini-2.0-flash",
    responseId: "resp-parts-123",
  };

  class MockGoogleGenAI {
    models = {
      generateContent: async () => mockResponse,
      generateContentStream: async () =>
        (async function* () {
          yield mockResponse;
        })(),
    };
  }

  return { GoogleGenAI: MockGoogleGenAI };
}

/**
 * Creates a mock module that yields multiple streaming chunks with
 * incremental text — simulates real Google GenAI streaming behaviour.
 */
function makeMultiChunkMockGenAIModule() {
  const chunk1 = {
    candidates: [
      {
        content: { role: "model", parts: [{ text: "Hello " }] },
        finishReason: null,
      },
    ],
    usageMetadata: null,
    modelVersion: null,
    responseId: null,
  };
  const chunk2 = {
    candidates: [
      {
        content: { role: "model", parts: [{ text: "World" }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
    modelVersion: "gemini-2.0-flash",
    responseId: "resp-multi-123",
  };

  class MockGoogleGenAI {
    models = {
      generateContent: async () => chunk2,
      generateContentStream: async () =>
        (async function* () {
          yield chunk1;
          yield chunk2;
        })(),
    };
  }

  return { GoogleGenAI: MockGoogleGenAI };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});

describe("GenAIInstrumentation — OTel 1.40 attributes", () => {
  let contextManager: AsyncHooksContextManager;

  before(() => {
    provider.register();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    memoryExporter.reset();
  });

  afterEach(() => {
    context.disable();
  });

  function makeInstrumentation(traceContent = true) {
    const instr = new GenAIInstrumentation({ traceContent });
    instr.setTracerProvider(provider);
    return instr;
  }

  const defaultParams = {
    model: "gemini-2.0-flash",
    contents: "What is OpenTelemetry?",
    config: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 1024,
    },
  };

  // -------------------------------------------------------------------------
  // traceContent: true
  // -------------------------------------------------------------------------

  describe("traceContent: true", () => {
    it("sets span name as 'generate_content {model}'", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].name, "generate_content gemini-2.0-flash");
    });

    it("sets gen_ai.provider.name to gcp.gen_ai", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_PROVIDER_NAME],
        GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
      );
    });

    it("sets gen_ai.operation.name to generate_content", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
      );
    });

    it("sets gen_ai.request.model", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
        "gemini-2.0-flash",
      );
    });

    it("strips models/ prefix from model name", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        ...defaultParams,
        model: "models/gemini-2.0-flash",
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.name, "generate_content gemini-2.0-flash");
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
        "gemini-2.0-flash",
      );
    });

    it("sets gen_ai.request.temperature, top_p, max_tokens", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.7);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.9);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 1024);
    });

    it("sets gen_ai.input.messages", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello Gemini",
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[0].parts[0].type, "text");
      assert.strictEqual(inputMessages[0].parts[0].content, "Hello Gemini");
    });

    it("sets gen_ai.output.messages", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        responseText: "42 is the answer",
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "42 is the answer",
      );
    });

    it("sets gen_ai.response.finish_reasons (always set — metadata)", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({ finishReason: "STOP" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop"],
      );
    });

    it("sets gen_ai.response.model and gen_ai.response.id", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-abc-123",
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
        "gemini-2.0-flash",
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_ID],
        "resp-abc-123",
      );
    });

    it("sets token usage attributes", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        promptTokens: 20,
        candidatesTokens: 10,
        totalTokens: 30,
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 20);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 10);
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
        30,
      );
    });

    it("sets gen_ai.usage.reasoning_tokens when thoughtsTokenCount is present", async () => {
      const instr = makeInstrumentation();

      class MockThinkingGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "42" }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 115,
              thoughtsTokenCount: 100,
            },
            modelVersion: "gemini-2.5-flash",
            responseId: "resp-thinking",
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockThinkingGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS],
        100,
      );
    });

    it("sets gen_ai.usage.cache_read.input_tokens when cachedContentTokenCount is present", async () => {
      const instr = makeInstrumentation();

      class MockCachedGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "cached" }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 50,
              candidatesTokenCount: 10,
              totalTokenCount: 60,
              cachedContentTokenCount: 40,
            },
            modelVersion: "gemini-2.0-flash",
            responseId: "resp-cached",
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockCachedGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
        40,
      );
    });

    it("sets gen_ai.request.thinking.budget_tokens when thinkingConfig.thinkingBudget is set", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Think carefully.",
        config: {
          thinkingConfig: { thinkingBudget: 1024 },
        } as unknown as import("@google/genai").GenerateContentConfig,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_REQUEST_THINKING_BUDGET_TOKENS],
        1024,
      );
    });

    it("maps SAFETY finish reason to content_filter OTel value in span attribute", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({ finishReason: "SAFETY" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["content_filter"],
      );
    });

    it("maps MAX_TOKENS finish reason to length OTel value in span attribute", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({ finishReason: "MAX_TOKENS" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["length"],
      );
    });

    it("handles multiple candidates in output messages and finish_reasons", async () => {
      const instr = makeInstrumentation();
      const multiCandidateResponse = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "Answer A" }] },
            finishReason: "STOP",
          },
          {
            content: { role: "model", parts: [{ text: "Answer B" }] },
            finishReason: "MAX_TOKENS",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8,
          totalTokenCount: 18,
        },
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-multi",
      };

      class MockMultiCandidateGenAI {
        models = {
          generateContent: async () => multiCandidateResponse,
          generateContentStream: async () =>
            (async function* () {
              yield multiCandidateResponse;
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockMultiCandidateGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];

      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop", "length"],
      );

      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages.length, 2);
      assert.strictEqual(outputMessages[0].parts[0].content, "Answer A");
      assert.strictEqual(outputMessages[0].finish_reason, "stop");
      assert.strictEqual(outputMessages[1].parts[0].content, "Answer B");
      assert.strictEqual(outputMessages[1].finish_reason, "length");
    });

    it("does not set gen_ai.input.messages when contents is an empty array", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [] as unknown as import("@google/genai").ContentListUnion,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined,
      );
    });

    it("defaults model to empty string when params.model is undefined", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        contents: "Hello",
      } as unknown as import("@google/genai").GenerateContentParameters);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], "");
    });

    it("handles _startSpan error gracefully when no exceptionLogger configured", async () => {
      const instr = new GenAIInstrumentation({ traceContent: true });
      instr.setTracerProvider(provider);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { tools: [circular] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span); // span still ends despite the error
      // Attributes set before the error (model) must be present
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
        "gemini-2.0-flash",
      );
      // tool_definitions must NOT be set — JSON.stringify threw on the circular ref
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        undefined,
      );
    });

    it("handles _endSpan error gracefully when no exceptionLogger configured", async () => {
      const instr = new GenAIInstrumentation({ traceContent: true });
      instr.setTracerProvider(provider);

      const circularArgs: Record<string, unknown> = {};
      circularArgs.self = circularArgs;

      class MockCircularNoLoggerGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      functionCall: {
                        id: "c1",
                        name: "fn",
                        args: circularArgs,
                      },
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: null,
            modelVersion: null,
            responseId: null,
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockCircularNoLoggerGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
    });

    it("does not set finish_reasons span attribute when all candidates have undefined finishReason", async () => {
      const instr = makeInstrumentation();

      class MockAllUndefinedFinishReasonGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "a" }] },
                finishReason: undefined,
              },
              {
                content: { role: "model", parts: [{ text: "b" }] },
                finishReason: undefined,
              },
            ],
            usageMetadata: null,
            modelVersion: null,
            responseId: null,
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockAllUndefinedFinishReasonGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        undefined,
      );
    });

    it("output.messages uses empty string for finishReason when candidate finishReason is undefined", async () => {
      const instr = makeInstrumentation();

      class MockUndefinedFinishReasonGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "ok" }] },
                finishReason: undefined,
              },
            ],
            usageMetadata: null,
            modelVersion: null,
            responseId: null,
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockUndefinedFinishReasonGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].finish_reason, "");
    });

    it("normalizes Content object with undefined role to 'user'", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Content object without role — should default to "user"
        contents: {
          parts: [{ text: "No role set" }],
        } as import("@google/genai").Content,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
    });

    it("normalizes Content object with null parts to empty parts array", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Content object with null parts
        contents: {
          role: "user",
          parts: null,
        } as unknown as import("@google/genai").ContentListUnion,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
      assert.deepStrictEqual(inputMessages[0].parts, []);
    });

    it("normalizes Content[] where item has null parts to empty parts array", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Content[] with null parts on one item — triggers c.parts ?? [] branch (line 458)
        contents: [
          { role: "user", parts: null },
        ] as unknown as import("@google/genai").ContentListUnion,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
      assert.deepStrictEqual(inputMessages[0].parts, []);
    });

    it("normalizes Content[] where items have no role to 'user'", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Content[] items without role
        contents: [
          { parts: [{ text: "No role" }] },
        ] as import("@google/genai").Content[],
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
    });

    it("sets system_instructions as empty array when Content has null parts", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        // Content with null parts — extractSystemInstructionParts returns []
        config: {
          systemInstruction: {
            role: "system",
            parts: null,
          } as unknown as import("@google/genai").ContentUnion,
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      // Empty parts → siParts.length === 0 → attribute must NOT be set
      assert.ok(span);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
        undefined,
      );
    });

    it("preserves per-candidate finish reasons without deduplication", async () => {
      const instr = makeInstrumentation();
      const dupCandidateResponse = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "Answer A" }] },
            finishReason: "STOP",
          },
          {
            content: { role: "model", parts: [{ text: "Answer B" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8,
          totalTokenCount: 18,
        },
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-dedup",
      };

      class MockDupCandidateGenAI {
        models = {
          generateContent: async () => dupCandidateResponse,
          generateContentStream: async () =>
            (async function* () {
              yield dupCandidateResponse;
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockDupCandidateGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop", "stop"],
      );
    });

    it("sets gen_ai.request.stop_sequences when stopSequences are provided", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { stopSequences: ["END", "STOP"] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES],
        ["END", "STOP"],
      );
    });

    it("does not set gen_ai.request.stop_sequences when stopSequences is empty", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { stopSequences: [] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES],
        undefined,
      );
    });

    it("sets gen_ai.request.top_k, presence_penalty, frequency_penalty", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: {
          topK: 40,
          presencePenalty: 0.5,
          frequencyPenalty: 0.3,
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_K], 40);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY],
        0.5,
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY],
        0.3,
      );
    });

    it("sets gen_ai.system_instructions when systemInstruction is provided", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: {
          systemInstruction: "You are a helpful assistant.",
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const si = JSON.parse(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string,
      );
      assert.ok(Array.isArray(si));
      assert.strictEqual(si[0].type, "text");
      assert.strictEqual(si[0].content, "You are a helpful assistant.");
    });

    it("sets system_instructions when systemInstruction is a single Part object", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        // Single Part — no .parts field, not an array, not a string
        config: {
          systemInstruction: {
            text: "You are a single-part assistant.",
          } as import("@google/genai").Part,
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const si = JSON.parse(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string,
      );
      assert.ok(Array.isArray(si));
      assert.strictEqual(si[0].type, "text");
      assert.strictEqual(si[0].content, "You are a single-part assistant.");
    });

    it("sets system_instructions when systemInstruction is a Content object with parts", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        // Content object — has .parts field, not an array, not a string
        config: {
          systemInstruction: {
            role: "system",
            parts: [{ text: "Be a concise assistant." }],
          } as import("@google/genai").Content,
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const si = JSON.parse(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string,
      );
      assert.ok(Array.isArray(si));
      assert.strictEqual(si[0].type, "text");
      assert.strictEqual(si[0].content, "Be a concise assistant.");
    });

    it("sets system_instructions when systemInstruction is a Part[]", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        // Part[] — array of Parts
        config: {
          systemInstruction: [
            { text: "Rule 1: be helpful." },
            { text: "Rule 2: be concise." },
          ] as import("@google/genai").Part[],
        },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const si = JSON.parse(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string,
      );
      assert.ok(Array.isArray(si));
      assert.strictEqual(si.length, 2);
      assert.strictEqual(si[0].type, "text");
      assert.strictEqual(si[0].content, "Rule 1: be helpful.");
      assert.strictEqual(si[1].type, "text");
      assert.strictEqual(si[1].content, "Rule 2: be concise.");
    });

    it("sets gen_ai.tool.definitions when tools is a single object (not wrapped in array)", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const toolDef = {
        functionDeclarations: [{ name: "lookup", description: "Look up data" }],
      };

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Look something up",
        config: { tools: toolDef as unknown as import("@google/genai").Tool },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const tools = JSON.parse(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS] as string,
      );
      assert.ok(Array.isArray(tools));
      assert.strictEqual(tools[0].functionDeclarations[0].name, "lookup");
    });

    it("does not set gen_ai.tool.definitions when tools array is empty", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { tools: [] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        undefined,
      );
    });

    it("filters out candidates without content.parts from output.messages", async () => {
      const instr = makeInstrumentation();

      class MockPartialCandidatesGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "Good candidate" }] },
                finishReason: "STOP",
              },
              {
                content: null, // no parts — should be filtered out
                finishReason: "SAFETY",
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 3,
              totalTokenCount: 8,
            },
            modelVersion: "gemini-2.0-flash",
            responseId: "resp-partial",
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockPartialCandidatesGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      // Only the candidate with parts should appear
      assert.strictEqual(outputMessages.length, 1);
      assert.strictEqual(outputMessages[0].parts[0].content, "Good candidate");
    });

    it("does not set finish_reasons when response has no candidates", async () => {
      const instr = makeInstrumentation();

      class MockNoCandidatesGenAI {
        models = {
          generateContent: async () => ({
            candidates: null,
            usageMetadata: null,
            modelVersion: null,
            responseId: null,
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNoCandidatesGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        undefined,
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
        undefined,
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_ID], undefined);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
        undefined,
      );
    });

    it("sets gen_ai.tool_definitions when tools are provided", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const toolDef = {
        functionDeclarations: [
          {
            name: "get_weather",
            description: "Returns current weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
        ],
      };

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "What's the weather in Paris?",
        config: { tools: [toolDef] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const tools = JSON.parse(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS] as string,
      );
      assert.ok(Array.isArray(tools));
      assert.strictEqual(tools[0].functionDeclarations[0].name, "get_weather");
    });

    it("sets input.messages when contents is a single Content object (not array)", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Single Content object — has .parts, not an array, not a string
        contents: {
          role: "user",
          parts: [{ text: "Hello from Content object" }],
        } as import("@google/genai").Content,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages.length, 1);
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(
        inputMessages[0].parts[0].content,
        "Hello from Content object",
      );
    });

    it("sets input.messages when contents is a flat Part[] (no role/parts wrapper)", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Part[] — items have no .parts field, treated as single user message
        contents: [
          { text: "Hello" },
          { text: " World" },
        ] as import("@google/genai").Part[],
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages.length, 1);
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[0].parts.length, 2);
    });

    it("sets input.messages when contents is a single Part object (no .parts, not array)", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        // Single Part — no .parts field, not an array, not a string
        contents: {
          text: "Hello from single Part",
        } as import("@google/genai").Part,
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages.length, 1);
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        inputMessages[0].parts[0].content,
        "Hello from single Part",
      );
    });

    it("sets input.messages with inlineData image part", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: "What is in this image?" },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "base64encodeddata",
                },
              },
            ],
          },
        ],
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[0].parts.length, 2);
      assert.strictEqual(inputMessages[0].parts[0].type, "text");
      assert.strictEqual(inputMessages[0].parts[1].type, "blob");
      assert.strictEqual(inputMessages[0].parts[1].modality, "image");
      assert.strictEqual(inputMessages[0].parts[1].mime_type, "image/png");
    });

    it("sets input.messages for multi-turn Content[] conversation", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
          { role: "model", parts: [{ text: "Hi there!" }] },
          { role: "user", parts: [{ text: "How are you?" }] },
        ],
      });

      const span = memoryExporter.getFinishedSpans()[0];
      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string,
      );
      assert.strictEqual(inputMessages.length, 3);
      assert.strictEqual(inputMessages[0].role, "user");
      assert.strictEqual(inputMessages[1].role, "assistant"); // model → assistant
      assert.strictEqual(inputMessages[2].role, "user");
    });

    it("output.messages has tool_call part when model returns functionCall", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModuleWithParts([
        {
          functionCall: {
            id: "call-abc",
            name: "get_weather",
            args: { city: "Tokyo" },
          },
        },
      ]);
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].parts[0].type, "tool_call");
      assert.strictEqual(outputMessages[0].parts[0].name, "get_weather");
      assert.deepStrictEqual(outputMessages[0].parts[0].arguments, {
        city: "Tokyo",
      });
    });

    it("output.messages has reasoning part when model returns thought: true", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModuleWithParts([
        { text: "Let me think about this...", thought: true },
        { text: "The answer is 42." },
      ]);
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].parts.length, 2);
      assert.strictEqual(outputMessages[0].parts[0].type, "reasoning");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "Let me think about this...",
      );
      assert.strictEqual(outputMessages[0].parts[1].type, "text");
    });

    it("omits finish_reasons span attribute when FINISH_REASON_UNSPECIFIED", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        finishReason: "FINISH_REASON_UNSPECIFIED",
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        undefined,
      );
    });
  });

  // -------------------------------------------------------------------------
  // traceContent: false
  // -------------------------------------------------------------------------

  describe("traceContent config fallback and context override", () => {
    it("defaults to sending content when traceContent is not configured", async () => {
      // traceContent: undefined → _shouldSendPrompts returns true (line 135 branch)
      const instr = new GenAIInstrumentation();
      instr.setTracerProvider(provider);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello without explicit traceContent",
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    });

    it("respects CONTEXT_KEY_ALLOW_TRACE_CONTENT context override", async () => {
      // ctxValue !== undefined → returns ctxValue (line 132 branch)
      const instr = makeInstrumentation(true); // traceContent: true
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      // Override context to disable content tracing
      const ctx = context
        .active()
        .setValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT, false);

      await context.with(ctx, async () => {
        const ai = new mockModule.GoogleGenAI({});
        await ai.models.generateContent(defaultParams);
      });

      const span = memoryExporter.getFinishedSpans()[0];
      // Context says false → input.messages should NOT be set despite traceContent:true
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined,
      );
    });
  });

  describe("traceContent: false", () => {
    it("does NOT set gen_ai.input.messages", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined,
      );
    });

    it("does NOT set gen_ai.output.messages", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("does NOT set gen_ai.tool.definitions when traceContent is false", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const toolDef = {
        functionDeclarations: [
          { name: "search", description: "Search the web" },
        ],
      };

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Search for cats",
        config: { tools: [toolDef] },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        undefined,
      );
    });

    it("does NOT set gen_ai.system_instructions when traceContent is false", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { systemInstruction: "You are a concise assistant." },
      });

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
        undefined,
      );
    });

    it("still sets finish_reasons (metadata, not content)", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({ finishReason: "STOP" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop"],
      );
    });

    it("still sets token usage (metadata, not content)", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({
        promptTokens: 20,
        candidatesTokens: 10,
        totalTokens: 30,
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 20);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 10);
    });
  });

  // -------------------------------------------------------------------------
  // Streaming
  // -------------------------------------------------------------------------

  describe("generateContentStream", () => {
    it("sets span attributes after stream completes", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        responseText: "streamed response",
        finishReason: "STOP",
        promptTokens: 10,
        candidatesTokens: 5,
        totalTokens: 15,
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-stream-456",
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.name, "generate_content gemini-2.0-flash");
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop"],
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
      assert.strictEqual(
        span.attributes[SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS],
        15,
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
        "gemini-2.0-flash",
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_ID],
        "resp-stream-456",
      );
    });

    it("sets gen_ai.output.messages after stream completes", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({
        responseText: "streaming text",
      });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts[0].content, "streaming text");
    });

    it("streaming with traceContent=false: does NOT set output.messages", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("streaming with traceContent=false: still sets finish_reasons (metadata, not content)", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({ finishReason: "STOP" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop"],
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("accumulates text content from multiple streaming chunks", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMultiChunkMockGenAIModule();
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].parts[0].content, "Hello World");
    });

    it("handles streaming chunk with null element inside candidates array — chunkCandidates[ci]?.content null path", async () => {
      // candidates: [null] means chunkCandidates[0] is null, so chunkCandidates[0]?.content
      // short-circuits — covers the first ?. on line 282
      const instr = makeInstrumentation();

      class MockNullElementCandidatesGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              yield {
                candidates: [null],
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              yield {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "ok" }] },
                    finishReason: "STOP",
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 2,
                  totalTokenCount: 7,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-null-elem",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNullElementCandidatesGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
    });

    it("multi-candidate streaming where one candidate never accumulates — accumulated?.length undefined path", async () => {
      // Candidate 0 has null parts in all chunks → accumulatedPartsByCandidate[0] stays a hole.
      // In the final .map() candidate 0 gets accumulated=undefined → !undefined?.length = true → candidate returned as-is.
      // This covers the !accumulated?.length undefined branch (line 317).
      const instr = makeInstrumentation();

      const chunk1 = {
        candidates: [
          { content: { role: "model", parts: null }, finishReason: null }, // no parts → no accumulation for index 0
          {
            content: { role: "model", parts: [{ text: "B " }] },
            finishReason: null,
          },
        ],
        usageMetadata: null,
        modelVersion: null,
        responseId: null,
      };
      const chunk2 = {
        candidates: [
          { content: { role: "model", parts: null }, finishReason: "STOP" }, // still no accumulation
          {
            content: { role: "model", parts: [{ text: "done" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-sparse-acc",
      };

      class MockSparseAccumulationGenAI {
        models = {
          generateContent: async () => chunk2,
          generateContentStream: async () =>
            (async function* () {
              yield chunk1;
              yield chunk2;
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockSparseAccumulationGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
      // Candidate 1 should appear in output (has accumulated text "B done")
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.ok(
        outputMessages.some(
          (m: Record<string, unknown>) =>
            (m.parts as { content?: unknown }[] | undefined)?.[0]?.content ===
            "B done",
        ),
      );
    });

    it("handles streaming chunk with null candidates without crashing", async () => {
      const instr = makeInstrumentation();

      class MockNullCandidatesChunkGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              // Yield chunk with null candidates — exercises optional chaining null paths (line 232)
              yield {
                candidates: null,
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              // Final chunk with real data
              yield {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "done" }] },
                    finishReason: "STOP",
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 3,
                  totalTokenCount: 8,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-nullcand",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNullCandidatesChunkGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
    });

    it("handles final chunk with null candidates — ternary false path", async () => {
      const instr = makeInstrumentation();

      class MockNullFinalCandidatesGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              // Final chunk: candidates is null — accumulatedParts empty, no candidate
              // Exercises lines 252 (candidates?.null), 267 (ternary false → use lastChunk)
              yield {
                candidates: null,
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 0,
                  totalTokenCount: 5,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-nullfinal",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNullFinalCandidatesGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
    });

    it("handles final chunk where candidate has null content — uses fallback role", async () => {
      const instr = makeInstrumentation();

      class MockNullContentCandidateGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              // Chunk 1: accumulates text parts so accumulatedParts.length > 0
              yield {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "hello" }] },
                    finishReason: null,
                  },
                ],
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              // Chunk 2 (last): candidate.content is null
              // → accumulatedParts.length > 0 && candidate is truthy → ternary true branch
              // → candidate.content ?? { role: "model" } hits the ?? fallback (line 261)
              yield {
                candidates: [{ content: null, finishReason: "STOP" }],
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 2,
                  totalTokenCount: 7,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-nullcontent",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNullContentCandidateGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
      // The fallback role should be used — output messages should still be set
      const outputMessages = span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES];
      assert.ok(outputMessages, "output messages should be set");
      const messages = JSON.parse(outputMessages as string);
      assert.strictEqual(messages[0].role, "assistant");
    });

    it("handles empty stream — no chunks yielded — ends span with OK", async () => {
      const instr = makeInstrumentation();

      class MockEmptyStreamGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockEmptyStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume nothing */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined,
      );
    });

    it("handles stream that fails before yielding — outer catch ends span with ERROR", async () => {
      const instr = makeInstrumentation();

      class MockRejectStreamGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: () =>
            Promise.reject(new Error("stream init failed")),
        };
      }

      const mockModule = { GoogleGenAI: MockRejectStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await assert.rejects(
        () =>
          (ai as unknown as MockGenAILike).models.generateContentStream(
            defaultParams,
          ),
        /stream init failed/,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, "stream init failed");
    });

    it("accumulates non-text parts (functionCall) from streaming chunks", async () => {
      const instr = makeInstrumentation();

      const fnCallChunk = {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    id: "c1",
                    name: "get_weather",
                    args: { city: "Paris" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-fn-stream",
      };

      class MockFnCallStreamGenAI {
        models = {
          generateContent: async () => fnCallChunk,
          generateContentStream: async () =>
            (async function* () {
              yield fnCallChunk;
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockFnCallStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].parts[0].type, "tool_call");
      assert.strictEqual(outputMessages[0].parts[0].name, "get_weather");
    });

    it("streaming with traceContent=false: still sets finish_reasons", async () => {
      const instr = makeInstrumentation(false);
      const mockModule = makeMockGenAIModule({ finishReason: "STOP" });
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ["stop"],
      );
    });

    it("early stream abandonment ends the span via finally block", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMultiChunkMockGenAIModule();
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI({});
      const stream = await ai.models.generateContentStream(defaultParams);

      // Consume only the first chunk, then break — simulates early abandonment
      for await (const chunk of stream) {
        void chunk;
        break;
      }

      // The finally block must have ended the span
      assert.strictEqual(
        memoryExporter.getFinishedSpans().length,
        1,
        "span should be ended by the finally block on early abandonment",
      );
      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
    });

    it("accumulates parts for all candidates in multi-candidate streaming", async () => {
      const instr = makeInstrumentation();

      const chunk1 = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "Answer A " }] },
            finishReason: null,
          },
          {
            content: { role: "model", parts: [{ text: "Answer B " }] },
            finishReason: null,
          },
        ],
        usageMetadata: null,
        modelVersion: null,
        responseId: null,
      };
      const chunk2 = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "continued" }] },
            finishReason: "STOP",
          },
          {
            content: { role: "model", parts: [{ text: "also continued" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8,
          totalTokenCount: 18,
        },
        modelVersion: "gemini-2.0-flash",
        responseId: "resp-multicand-stream",
      };

      class MockMultiCandStreamGenAI {
        models = {
          generateContent: async () => chunk2,
          generateContentStream: async () =>
            (async function* () {
              yield chunk1;
              yield chunk2;
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockMultiCandStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);
      for await (const chunk of stream) {
        void chunk;
        /* consume */
      }

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      // Both candidates must appear with accumulated text
      assert.strictEqual(outputMessages.length, 2);
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "Answer A continued",
      );
      assert.strictEqual(
        outputMessages[1].parts[0].content,
        "Answer B also continued",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Automatic instrumentation (wrap / unwrap)
  // -------------------------------------------------------------------------

  describe("automatic instrumentation via wrap/unwrap", () => {
    it("wrap patches GoogleGenAI and creates spans just like manuallyInstrument", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      // Call the private wrap method that the instrumentation framework invokes on module load
      (instr as unknown as InstrumentationWithPrivateMethods).wrap(
        mockModule as unknown as typeof import("@google/genai"),
        "1.0.0",
      );

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
      assert.strictEqual(span.name, "generate_content gemini-2.0-flash");
    });

    it("unwrap restores original GoogleGenAI and stops creating spans", () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      (instr as unknown as InstrumentationWithPrivateMethods).wrap(
        mockModule as unknown as typeof import("@google/genai"),
        "1.0.0",
      );
      // Unwrap should not throw and should restore the module
      assert.doesNotThrow(() =>
        (instr as unknown as InstrumentationWithPrivateMethods).unwrap(
          mockModule as unknown as typeof import("@google/genai"),
        ),
      );
    });

    it("wrap is idempotent — calling it twice does not double-patch", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      (instr as unknown as InstrumentationWithPrivateMethods).wrap(
        mockModule as unknown as typeof import("@google/genai"),
        "1.0.0",
      );
      (instr as unknown as InstrumentationWithPrivateMethods).wrap(
        mockModule as unknown as typeof import("@google/genai"),
        "1.0.0",
      ); // second call should be a no-op

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      // Exactly one span — double-patching would produce two
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
    });

    it("manuallyInstrument is idempotent — calling it twice does not double-patch", async () => {
      const instr = makeInstrumentation();
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      ); // second call should be a no-op

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent(defaultParams);

      // Exactly one span — double-patching would produce two
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("synchronous throw in generateContent triggers safeExecuteInTheMiddle error callback", () => {
      const instr = makeInstrumentation();

      class MockSyncThrowGenAI {
        models = {
          // Synchronous (non-async) function that throws — exercises sync-throw span cleanup
          generateContent: () => {
            throw new Error("sync generateContent error");
          },
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockSyncThrowGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      // Synchronous throw — cannot use assert.rejects (needs Promise)
      assert.throws(
        () =>
          (ai as unknown as MockGenAILike).models.generateContent(
            defaultParams,
          ),
        /sync generateContent error/,
      );
      // Span must be ended — previously leaked on sync throw
      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span, "span should have been ended");
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    });

    it("synchronous throw in generateContentStream triggers safeExecuteInTheMiddle error callback", () => {
      const instr = makeInstrumentation();

      class MockSyncThrowStreamGenAI {
        models = {
          generateContent: async () => ({}),
          // Synchronous (non-async) function that throws — exercises sync-throw span cleanup
          generateContentStream: () => {
            throw new Error("sync stream error");
          },
        };
      }

      const mockModule = { GoogleGenAI: MockSyncThrowStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      assert.throws(
        () =>
          (ai as unknown as MockGenAILike).models.generateContentStream(
            defaultParams,
          ),
        /sync stream error/,
      );
      // Span must be ended — previously leaked on sync throw
      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span, "span should have been ended");
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    });

    it("generateContent rejection ends span with ERROR status", async () => {
      const instr = makeInstrumentation();

      class MockErrorGenAI {
        models = {
          generateContent: async () => {
            throw new Error("API quota exceeded");
          },
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockErrorGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await assert.rejects(
        () =>
          (ai as unknown as MockGenAILike).models.generateContent(
            defaultParams,
          ),
        /API quota exceeded/,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, "API quota exceeded");
      assert.strictEqual(span.events.length, 1);
      assert.strictEqual(span.events[0].name, "exception");
    });

    it("calls exceptionLogger when _startSpan encounters an error", async () => {
      const exceptions: unknown[] = [];
      const instr = new GenAIInstrumentation({
        traceContent: true,
        exceptionLogger: (e) => exceptions.push(e),
      });
      instr.setTracerProvider(provider);
      const mockModule = makeMockGenAIModule({});
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      // Circular reference causes JSON.stringify to throw inside _startSpan
      const circular: Record<string, unknown> = { functionDeclarations: [{}] };
      circular.self = circular;

      const ai = new mockModule.GoogleGenAI({});
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello",
        config: { tools: [circular] },
      });

      assert.strictEqual(exceptions.length, 1);
      // Span is still created and ended despite the error
      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        undefined,
      );
    });

    it("calls exceptionLogger when _endSpan encounters an error", async () => {
      const exceptions: unknown[] = [];
      const instr = new GenAIInstrumentation({
        traceContent: true,
        exceptionLogger: (e) => exceptions.push(e),
      });
      instr.setTracerProvider(provider);

      // Circular args in functionCall causes JSON.stringify to throw inside _endSpan
      const circularArgs: Record<string, unknown> = {};
      circularArgs.self = circularArgs;

      class MockCircularResponseGenAI {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      functionCall: {
                        id: "c1",
                        name: "fn",
                        args: circularArgs,
                      },
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 3,
              totalTokenCount: 8,
            },
            modelVersion: "gemini-2.0-flash",
            responseId: "resp-circular",
          }),
          generateContentStream: async () =>
            (async function* () {
              /* empty stream */
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockCircularResponseGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      await (ai as unknown as MockGenAILike).models.generateContent(
        defaultParams,
      );

      assert.strictEqual(exceptions.length, 1);
      // Span still ends with OK despite the error in _endSpan
      const span = memoryExporter.getFinishedSpans()[0];
      assert.ok(span);
    });

    it("streaming error ends span with ERROR status", async () => {
      const instr = makeInstrumentation();

      class MockStreamErrorGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              yield {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "partial" }] },
                    finishReason: null,
                  },
                ],
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              throw new Error("Stream interrupted");
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockStreamErrorGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);

      await assert.rejects(async () => {
        for await (const chunk of stream) {
          void chunk;
          /* consume */
        }
      }, /Stream interrupted/);

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, "Stream interrupted");
      assert.strictEqual(span.events[0].name, "exception");
    });

    it("keeps thinking and regular text parts separate across streaming chunks", async () => {
      const instr = makeInstrumentation();

      class MockThinkingStreamGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              yield {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: "Let me think...", thought: true }],
                    },
                    finishReason: null,
                  },
                ],
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              yield {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: " more thoughts", thought: true }],
                    },
                    finishReason: null,
                  },
                ],
                usageMetadata: null,
                modelVersion: null,
                responseId: null,
              };
              yield {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: "Final answer" }],
                    },
                    finishReason: "STOP",
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 10,
                  totalTokenCount: 15,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-thinking-stream",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockThinkingStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
      }

      const span = memoryExporter.getFinishedSpans()[0];
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].parts.length, 2);
      assert.strictEqual(outputMessages[0].parts[0].type, "reasoning");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "Let me think... more thoughts",
      );
      assert.strictEqual(outputMessages[0].parts[1].type, "text");
      assert.strictEqual(outputMessages[0].parts[1].content, "Final answer");
    });

    it("omits finish_reasons span attr and sets finish_reason '' when final chunk has null finishReason", async () => {
      const instr = makeInstrumentation();

      class MockNullFinishReasonStreamGenAI {
        models = {
          generateContent: async () => ({}),
          generateContentStream: async () =>
            (async function* () {
              yield {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "some text" }] },
                    finishReason: null,
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 5,
                  candidatesTokenCount: 3,
                  totalTokenCount: 8,
                },
                modelVersion: "gemini-2.0-flash",
                responseId: "resp-null-finish",
              };
            })(),
        };
      }

      const mockModule = { GoogleGenAI: MockNullFinishReasonStreamGenAI };
      instr.manuallyInstrument(
        mockModule as unknown as typeof import("@google/genai"),
      );

      const ai = new mockModule.GoogleGenAI();
      const stream = await (
        ai as unknown as MockGenAILike
      ).models.generateContentStream(defaultParams);

      for await (const chunk of stream) {
        void chunk;
      }

      const span = memoryExporter.getFinishedSpans()[0];
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        undefined,
      );
      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string,
      );
      assert.strictEqual(outputMessages[0].finish_reason, "");
    });
  });
});
