import * as assert from "assert";
import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {
  transformAiSdkSpanName,
  transformResponseText,
  transformPromptMessages,
  transformPromptTokens,
  transformCompletionTokens,
  calculateTotalTokens,
  transformVendor,
  transformAiSdkAttributes,
  transformAiSdkSpan,
} from "../src/lib/tracing/ai-sdk-transformations";

// Helper function to create a mock ReadableSpan
const createMockSpan = (
  name: string,
  attributes: Record<string, any> = {},
): ReadableSpan => {
  return {
    name,
    attributes,
  } as ReadableSpan;
};

describe("AI SDK Transformations", () => {
  describe("transformAiSdkSpanName", () => {
    it("should transform ai.generateText.doGenerate to ai.generateText.generate", () => {
      const span = createMockSpan("ai.generateText.doGenerate");
      transformAiSdkSpanName(span);
      assert.strictEqual(span.name, "ai.generateText.generate");
    });

    it("should transform ai.streamText.doStream to ai.streamText.stream", () => {
      const span = createMockSpan("ai.streamText.doStream");
      transformAiSdkSpanName(span);
      assert.strictEqual(span.name, "ai.streamText.stream");
    });

    it("should not transform unrecognized span names", () => {
      const span = createMockSpan("some.other.span");
      transformAiSdkSpanName(span);
      assert.strictEqual(span.name, "some.other.span");
    });

    it("should handle empty span name", () => {
      const span = createMockSpan("");
      transformAiSdkSpanName(span);
      assert.strictEqual(span.name, "");
    });
  });

  describe("transformResponseText", () => {
    it("should transform ai.response.text to completion attributes", () => {
      const attributes = {
        "ai.response.text": "Hello, how can I help you?",
        someOtherAttr: "value",
      };

      transformResponseText(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello, how can I help you?",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );
      assert.strictEqual(attributes["ai.response.text"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.response.text is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformResponseText(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty response text", () => {
      const attributes = {
        "ai.response.text": "",
      };

      transformResponseText(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );
      assert.strictEqual(attributes["ai.response.text"], undefined);
    });
  });

  describe("transformPromptMessages", () => {
    it("should transform ai.prompt.messages to prompt attributes", () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello" },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformPromptMessages(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "You are a helpful assistant",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "system",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.1.content`],
        "Hello",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.1.role`],
        "user",
      );
      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
    });

    it("should handle messages with object content", () => {
      const messages = [
        {
          role: "user",
          content: { type: "text", text: "What's in this image?" },
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformPromptMessages(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        JSON.stringify({ type: "text", text: "What's in this image?" }),
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });

    it("should handle invalid JSON gracefully", () => {
      const attributes = {
        "ai.prompt.messages": "invalid json {",
        someOtherAttr: "value",
      };

      transformPromptMessages(attributes);

      // Should not modify attributes when JSON parsing fails
      assert.strictEqual(attributes["ai.prompt.messages"], "invalid json {");
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.prompt.messages is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformPromptMessages(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty messages array", () => {
      const attributes = {
        "ai.prompt.messages": JSON.stringify([]),
      };

      transformPromptMessages(attributes);

      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
    });
  });

  describe("transformPromptTokens", () => {
    it("should transform ai.usage.promptTokens to LLM usage attribute", () => {
      const attributes = {
        "ai.usage.promptTokens": 50,
        someOtherAttr: "value",
      };

      transformPromptTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        50,
      );
      assert.strictEqual(attributes["ai.usage.promptTokens"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.usage.promptTokens is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformPromptTokens(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero prompt tokens", () => {
      const attributes = {
        "ai.usage.promptTokens": 0,
      };

      transformPromptTokens(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS], 0);
    });
  });

  describe("transformCompletionTokens", () => {
    it("should transform ai.usage.completionTokens to LLM usage attribute", () => {
      const attributes = {
        "ai.usage.completionTokens": 25,
        someOtherAttr: "value",
      };

      transformCompletionTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        25,
      );
      assert.strictEqual(attributes["ai.usage.completionTokens"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.usage.completionTokens is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformCompletionTokens(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero completion tokens", () => {
      const attributes = {
        "ai.usage.completionTokens": 0,
      };

      transformCompletionTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        0,
      );
    });
  });

  describe("calculateTotalTokens", () => {
    it("should calculate total tokens from prompt and completion tokens", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: 50,
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: 25,
      };

      calculateTotalTokens(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should handle string token values", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: "50",
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: "25",
      };

      calculateTotalTokens(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should not calculate total when prompt tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: 25,
      };

      calculateTotalTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when completion tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: 50,
      };

      calculateTotalTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when both tokens are missing", () => {
      const attributes = {};

      calculateTotalTokens(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });
  });

  describe("transformVendor", () => {
    it("should transform openai.chat provider to OpenAI system", () => {
      const attributes = {
        "ai.model.provider": "openai.chat",
        someOtherAttr: "value",
      };

      transformVendor(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
      assert.strictEqual(attributes["ai.model.provider"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should transform any openai provider to OpenAI system", () => {
      const openaiProviders = [
        "openai.completions",
        "openai.embeddings",
        "openai",
      ];

      openaiProviders.forEach((provider) => {
        const attributes = {
          "ai.model.provider": provider,
        };

        transformVendor(attributes);

        assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
        assert.strictEqual(attributes["ai.model.provider"], undefined);
      });
    });

    it("should transform other providers to their value", () => {
      const attributes = {
        "ai.model.provider": "anthropic",
      };

      transformVendor(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "anthropic");
      assert.strictEqual(attributes["ai.model.provider"], undefined);
    });

    it("should not modify attributes when ai.model.provider is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformVendor(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty provider value", () => {
      const attributes = {
        "ai.model.provider": "",
      };

      transformVendor(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "");
      assert.strictEqual(attributes["ai.model.provider"], undefined);
    });
  });

  describe("transformAiSdkAttributes", () => {
    it("should apply all attribute transformations", () => {
      const attributes = {
        "ai.response.text": "Hello!",
        "ai.prompt.messages": JSON.stringify([{ role: "user", content: "Hi" }]),
        "ai.usage.promptTokens": 10,
        "ai.usage.completionTokens": 5,
        "ai.model.provider": "openai.chat",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

      // Check response text transformation
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello!",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );

      // Check prompt messages transformation
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Hi",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );

      // Check token transformations
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        10,
      );
      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        5,
      );
      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 15);

      // Check vendor transformation
      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");

      // Check original AI SDK attributes are removed
      assert.strictEqual(attributes["ai.response.text"], undefined);
      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
      assert.strictEqual(attributes["ai.usage.promptTokens"], undefined);
      assert.strictEqual(attributes["ai.usage.completionTokens"], undefined);
      assert.strictEqual(attributes["ai.model.provider"], undefined);

      // Check other attributes are preserved
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should handle partial attribute sets", () => {
      const attributes = {
        "ai.response.text": "Hello!",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello!",
      );
      assert.strictEqual(attributes.someOtherAttr, "value");
    });
  });

  describe("transformAiSdkSpan", () => {
    it("should transform both span name and attributes", () => {
      const span = createMockSpan("ai.generateText.doGenerate", {
        "ai.response.text": "Hello!",
        "ai.usage.promptTokens": 10,
        "ai.usage.completionTokens": 5,
      });

      transformAiSdkSpan(span);

      // Check span name transformation
      assert.strictEqual(span.name, "ai.generateText.generate");

      // Check attribute transformations
      assert.strictEqual(
        span.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello!",
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        10,
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        5,
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        15,
      );
    });

    it("should handle spans with no transformations needed", () => {
      const span = createMockSpan("some.other.span", {
        someAttr: "value",
      });
      const originalName = span.name;
      const originalAttributes = { ...span.attributes };

      transformAiSdkSpan(span);

      assert.strictEqual(span.name, originalName);
      assert.deepStrictEqual(span.attributes, originalAttributes);
    });
  });
});
