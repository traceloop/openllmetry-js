import * as assert from "assert";
import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { context } from "@opentelemetry/api";
import { ASSOCATION_PROPERTIES_KEY } from "../src/lib/tracing/tracing";
import {
  transformLLMSpans,
  transformAiSdkSpanAttributes,
  transformAiSdkSpanNames,
} from "../src/lib/tracing/ai-sdk-transformations";

// Helper function to create a mock ReadableSpan
const createMockSpan = (
  name: string,
  attributes: Record<string, any> = {},
): ReadableSpan => {
  return {
    name,
    attributes,
    instrumentationScope: { name: "ai", version: "1.0.0" },
  } as ReadableSpan;
};

// Helper function to create a mock span with updateName capability
const createMockSpanWithUpdate = (
  name: string,
  attributes: Record<string, any> = {},
) => {
  const span = {
    name,
    attributes,
    instrumentationScope: { name: "ai", version: "1.0.0" },
    updateName: (newName: string) => {
      span.name = newName;
    },
  };
  return span as ReadableSpan & { updateName: (name: string) => void };
};

describe("AI SDK Transformations", () => {
  describe("transformAiSdkAttributes - response text", () => {
    it("should transform ai.response.text to completion attributes", () => {
      const attributes = {
        "ai.response.text": "Hello, how can I help you?",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty response text", () => {
      const attributes = {
        "ai.response.text": "",
      };

      transformLLMSpans(attributes);

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

  describe("transformAiSdkAttributes - response object", () => {
    it("should transform ai.response.object to completion attributes", () => {
      const attributes = {
        "ai.response.object": '{"filteredText":"Hello","changesApplied":false}',
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        '{"filteredText":"Hello","changesApplied":false}',
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );
      assert.strictEqual(attributes["ai.response.object"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.response.object is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });
  });

  describe("transformAiSdkAttributes - response tool calls", () => {
    it("should transform ai.response.toolCalls to completion attributes", () => {
      const toolCallsData = [
        {
          toolCallType: "function",
          toolCallId: "call_gULeWLlk7y32MKz6Fb5eaF3K",
          toolName: "getWeather",
          args: '{"location": "San Francisco"}',
        },
        {
          toolCallType: "function",
          toolCallId: "call_arNHlNj2FTOngnyieQfTe1bv",
          toolName: "searchRestaurants",
          args: '{"city": "San Francisco"}',
        },
      ];

      const attributes = {
        "ai.response.toolCalls": JSON.stringify(toolCallsData),
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Check that role is set
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );

      // Check first tool call
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.0.arguments`
        ],
        '{"location": "San Francisco"}',
      );

      // Check second tool call
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.1.name`],
        "searchRestaurants",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.1.arguments`
        ],
        '{"city": "San Francisco"}',
      );

      // Check original attribute is removed
      assert.strictEqual(attributes["ai.response.toolCalls"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.response.toolCalls is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle invalid JSON gracefully", () => {
      const attributes = {
        "ai.response.toolCalls": "invalid json {",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Should not modify attributes when JSON parsing fails
      assert.strictEqual(attributes["ai.response.toolCalls"], "invalid json {");
      assert.strictEqual(attributes.someOtherAttr, "value");
    });
  });

  describe("transformAiSdkAttributes - prompt messages", () => {
    it("should transform ai.prompt.messages to prompt attributes", () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello" },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "What's in this image?",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });

    it("should extract text from content array", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Help me plan a trip to San Francisco." },
            {
              type: "text",
              text: "I'd like to know about the weather and restaurants.",
            },
          ],
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Help me plan a trip to San Francisco. I'd like to know about the weather and restaurants.",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });

    it("should filter out non-text content types", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            { type: "image", url: "data:image/jpeg;base64,..." },
            { type: "text", text: "Please describe it." },
          ],
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "What's in this image? Please describe it.",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });

    it("should extract text from JSON string content", () => {
      const messages = [
        {
          role: "user",
          content:
            '[{"type":"text","text":"Help me plan a trip to San Francisco."},{"type":"text","text":"What should I know about the weather?"}]',
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Help me plan a trip to San Francisco. What should I know about the weather?",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });

    it("should preserve complex content like tool calls", () => {
      const messages = [
        {
          role: "assistant",
          content:
            '[{"type":"tool-call","id":"call_123","name":"getWeather","args":{"location":"Paris"}}]',
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      // Should preserve the original JSON since it's not simple text
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        '[{"type":"tool-call","id":"call_123","name":"getWeather","args":{"location":"Paris"}}]',
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "assistant",
      );
    });

    it("should preserve mixed content arrays", () => {
      const messages = [
        {
          role: "user",
          content:
            '[{"type":"text","text":"What\'s the weather?"},{"type":"image","url":"data:image/jpeg;base64,..."}]',
        },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      // Should preserve the original JSON since it has mixed content
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        '[{"type":"text","text":"What\'s the weather?"},{"type":"image","url":"data:image/jpeg;base64,..."}]',
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

      transformLLMSpans(attributes);

      // Should not modify attributes when JSON parsing fails
      assert.strictEqual(attributes["ai.prompt.messages"], "invalid json {");
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.prompt.messages is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty messages array", () => {
      const attributes = {
        "ai.prompt.messages": JSON.stringify([]),
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
    });

    it("should unescape JSON escape sequences in simple string content", () => {
      const attributes = {
        "ai.prompt.messages":
          '[{"role":"user","content":[{"type":"text","text":"Help me plan a trip to San Francisco. I\'d like to know:\\n1. What\'s the weather like there?\\n2. Find some good restaurants to try\\n3. If I\'m traveling from New York, how far is it?\\n\\nPlease use the available tools to get current information and provide a comprehensive travel guide."}]}]',
      };

      transformLLMSpans(attributes);

      const result = attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`];

      // The escape sequences should be properly unescaped
      assert.strictEqual(
        result,
        "Help me plan a trip to San Francisco. I'd like to know:\n1. What's the weather like there?\n2. Find some good restaurants to try\n3. If I'm traveling from New York, how far is it?\n\nPlease use the available tools to get current information and provide a comprehensive travel guide.",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
    });
  });

  describe("transformAiSdkAttributes - single prompt", () => {
    it("should transform ai.prompt to prompt attributes", () => {
      const promptData = {
        prompt:
          "Help me plan a trip to San Francisco. I\\'d like to know:\\n1. What\\'s the weather like there?\\n2. Find some restaurants\\n\\nPlease help!",
      };
      const attributes = {
        "ai.prompt": JSON.stringify(promptData),
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Help me plan a trip to San Francisco. I\\'d like to know:\\n1. What\\'s the weather like there?\\n2. Find some restaurants\\n\\nPlease help!",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
      assert.strictEqual(attributes["ai.prompt"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.prompt is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle invalid JSON gracefully", () => {
      const attributes = {
        "ai.prompt": "invalid json {",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Should not modify attributes when JSON parsing fails
      assert.strictEqual(attributes["ai.prompt"], "invalid json {");
      assert.strictEqual(attributes.someOtherAttr, "value");
    });
  });

  describe("transformAiSdkAttributes - tools", () => {
    it("should transform ai.prompt.tools to LLM request functions attributes", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "getWeather",
            description: "Get the current weather for a specified location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The location to get weather for",
                },
              },
              required: ["location"],
            },
          },
          {
            name: "calculateDistance",
            description: "Calculate distance between two cities",
            parameters: {
              type: "object",
              properties: {
                fromCity: { type: "string" },
                toCity: { type: "string" },
              },
            },
          },
        ],
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Get the current weather for a specified location",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        JSON.stringify({
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The location to get weather for",
            },
          },
          required: ["location"],
        }),
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        "calculateDistance",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.description`],
        "Calculate distance between two cities",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.parameters`],
        JSON.stringify({
          type: "object",
          properties: {
            fromCity: { type: "string" },
            toCity: { type: "string" },
          },
        }),
      );

      // Original attribute should be removed
      assert.strictEqual(attributes["ai.prompt.tools"], undefined);

      // Other attributes should remain unchanged
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should handle tools with missing properties gracefully", () => {
      const attributes = {
        "ai.prompt.tools": [
          {
            name: "toolWithOnlyName",
            // missing description and parameters
          },
          {
            description: "Tool with only description",
            // missing name and parameters
          },
          {
            name: "toolWithStringParams",
            description: "Tool with pre-stringified parameters",
            parameters: '{"type": "object"}',
          },
        ],
      };

      transformLLMSpans(attributes);

      // Tool 0: only has name
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "toolWithOnlyName",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        undefined,
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        undefined,
      );

      // Tool 1: only has description
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        undefined,
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.description`],
        "Tool with only description",
      );

      // Tool 2: has string parameters (should be used as-is)
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.2.name`],
        "toolWithStringParams",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.2.parameters`],
        '{"type": "object"}',
      );

      assert.strictEqual(attributes["ai.prompt.tools"], undefined);
    });

    it("should handle empty tools array", () => {
      const attributes = {
        "ai.prompt.tools": [],
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Should not create any function attributes
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        undefined,
      );

      // Original attribute should be removed
      assert.strictEqual(attributes["ai.prompt.tools"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should handle invalid tools data gracefully", () => {
      const attributes = {
        "ai.prompt.tools": "not an array",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Should not create any function attributes
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        undefined,
      );

      // Original attribute should be removed
      assert.strictEqual(attributes["ai.prompt.tools"], undefined);
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.prompt.tools is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes.someOtherAttr, "value");
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        undefined,
      );
    });

    it("should handle tools with null/undefined values", () => {
      const attributes = {
        "ai.prompt.tools": [null, undefined, {}, { name: "validTool" }],
      };

      transformLLMSpans(attributes);

      // Only the valid tool should create attributes
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.3.name`],
        "validTool",
      );

      // First three should not create attributes since they're invalid
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        undefined,
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        undefined,
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.2.name`],
        undefined,
      );
    });

    it("should handle AI SDK string format tools", () => {
      // This is how AI SDK actually stores tools - as JSON strings in array
      const attributes = {
        "ai.prompt.tools": [
          '{"type":"function","name":"getWeather","description":"Get weather","parameters":{"type":"object","properties":{"location":{"type":"string"}}}}',
          '{"type":"function","name":"searchRestaurants","description":"Find restaurants","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}',
        ],
      };

      transformLLMSpans(attributes);

      // Should parse and transform the first tool
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Get weather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        JSON.stringify({
          type: "object",
          properties: { location: { type: "string" } },
        }),
      );

      // Should parse and transform the second tool
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        "searchRestaurants",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.description`],
        "Find restaurants",
      );

      assert.strictEqual(attributes["ai.prompt.tools"], undefined);
    });

    it("should handle mixed format tools (strings and objects)", () => {
      const attributes = {
        "ai.prompt.tools": [
          '{"type":"function","name":"stringTool","description":"Tool from string"}',
          { name: "objectTool", description: "Tool from object" },
        ],
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "stringTool",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Tool from string",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        "objectTool",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.description`],
        "Tool from object",
      );
    });
  });

  describe("transformAiSdkAttributes - prompt tokens", () => {
    it("should transform ai.usage.promptTokens to LLM usage attribute", () => {
      const attributes = {
        "ai.usage.promptTokens": 50,
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero prompt tokens", () => {
      const attributes = {
        "ai.usage.promptTokens": 0,
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS], 0);
    });
  });

  describe("transformAiSdkAttributes - completion tokens", () => {
    it("should transform ai.usage.completionTokens to LLM usage attribute", () => {
      const attributes = {
        "ai.usage.completionTokens": 25,
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero completion tokens", () => {
      const attributes = {
        "ai.usage.completionTokens": 0,
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        0,
      );
    });
  });

  describe("transformAiSdkAttributes - total tokens calculation", () => {
    it("should calculate total tokens from prompt and completion tokens", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: 50,
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: 25,
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should handle string token values", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: "50",
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: "25",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should not calculate total when prompt tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: 25,
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when completion tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: 50,
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when both tokens are missing", () => {
      const attributes = {};

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });
  });

  describe("transformAiSdkAttributes - vendor", () => {
    it("should transform openai.chat provider to OpenAI system", () => {
      const attributes = {
        "ai.model.provider": "openai.chat",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

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

        transformLLMSpans(attributes);

        assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");
        assert.strictEqual(attributes["ai.model.provider"], undefined);
      });
    });

    it("should transform azure openai provider to Azure system", () => {
      const openaiProviders = ["azure-openai"];

      openaiProviders.forEach((provider) => {
        const attributes = {
          "ai.model.provider": provider,
        };

        transformLLMSpans(attributes);

        assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Azure");
        assert.strictEqual(attributes["ai.model.provider"], undefined);
      });
    });

    it("should transform other providers to their value", () => {
      const attributes = {
        "ai.model.provider": "anthropic",
      };

      transformLLMSpans(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Anthropic");
      assert.strictEqual(attributes["ai.model.provider"], undefined);
    });

    it("should not modify attributes when ai.model.provider is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformLLMSpans(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty provider value", () => {
      const attributes = {
        "ai.model.provider": "",
      };

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

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

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello!",
      );
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should apply all attribute transformations for generateObject", () => {
      const attributes = {
        "ai.response.object": '{"result":"Hello!"}',
        "ai.prompt.messages": JSON.stringify([{ role: "user", content: "Hi" }]),
        "ai.usage.promptTokens": 10,
        "ai.usage.completionTokens": 5,
        "ai.model.provider": "azure-openai.chat",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Check response object transformation
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        '{"result":"Hello!"}',
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
      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Azure");

      // Check original AI SDK attributes are removed
      assert.strictEqual(attributes["ai.response.object"], undefined);
      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
      assert.strictEqual(attributes["ai.usage.promptTokens"], undefined);
      assert.strictEqual(attributes["ai.usage.completionTokens"], undefined);
      assert.strictEqual(attributes["ai.model.provider"], undefined);

      // Check other attributes are preserved
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should transform tools along with other attributes", () => {
      const attributes = {
        "ai.response.text": "I'll help you with that!",
        "ai.prompt.messages": JSON.stringify([
          { role: "user", content: "Get weather" },
        ]),
        "ai.prompt.tools": [
          {
            name: "getWeather",
            description: "Get weather for a location",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        ],
        "ai.usage.promptTokens": 15,
        "ai.usage.completionTokens": 8,
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Check tools transformation
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.description`],
        "Get weather for a location",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.parameters`],
        JSON.stringify({
          type: "object",
          properties: { location: { type: "string" } },
        }),
      );

      // Check other transformations still work
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "I'll help you with that!",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Get weather",
      );
      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 23);

      // Check original attributes are removed
      assert.strictEqual(attributes["ai.prompt.tools"], undefined);
      assert.strictEqual(attributes["ai.response.text"], undefined);

      // Check other attributes are preserved
      assert.strictEqual(attributes.someOtherAttr, "value");
    });
  });

  describe("transformAiSdkAttributes - gen_ai input/output messages", () => {
    it("should create gen_ai.input.messages for conversation with text", () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello, how are you?" },
        { role: "assistant", content: "I'm doing well, thank you!" },
        { role: "user", content: "Can you help me with something?" },
      ];
      const attributes = {
        "ai.prompt.messages": JSON.stringify(messages),
      };

      transformLLMSpans(attributes);

      // Check that gen_ai.input.messages is properly set
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_INPUT_MESSAGES],
        "string",
      );

      const inputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_INPUT_MESSAGES],
      );
      assert.strictEqual(inputMessages.length, 4);

      // Check system message
      assert.strictEqual(inputMessages[0].role, "system");
      assert.strictEqual(inputMessages[0].parts.length, 1);
      assert.strictEqual(inputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        inputMessages[0].parts[0].content,
        "You are a helpful assistant",
      );

      // Check user messages
      assert.strictEqual(inputMessages[1].role, "user");
      assert.strictEqual(
        inputMessages[1].parts[0].content,
        "Hello, how are you?",
      );

      assert.strictEqual(inputMessages[2].role, "assistant");
      assert.strictEqual(
        inputMessages[2].parts[0].content,
        "I'm doing well, thank you!",
      );

      assert.strictEqual(inputMessages[3].role, "user");
      assert.strictEqual(
        inputMessages[3].parts[0].content,
        "Can you help me with something?",
      );
    });

    it("should create gen_ai.output.messages for text response", () => {
      const attributes = {
        "ai.response.text": "I'd be happy to help you with that!",
      };

      transformLLMSpans(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
      );
      assert.strictEqual(outputMessages.length, 1);
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts.length, 1);
      assert.strictEqual(outputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        "I'd be happy to help you with that!",
      );
    });

    it("should create gen_ai.output.messages for tool calls", () => {
      const toolCallsData = [
        {
          toolCallType: "function",
          toolCallId: "call_weather_123",
          toolName: "getWeather",
          args: '{"location": "San Francisco", "unit": "celsius"}',
        },
        {
          toolCallType: "function",
          toolCallId: "call_restaurant_456",
          toolName: "findRestaurants",
          args: '{"location": "San Francisco", "cuisine": "italian"}',
        },
      ];

      const attributes = {
        "ai.response.toolCalls": JSON.stringify(toolCallsData),
      };

      transformLLMSpans(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
      );
      assert.strictEqual(outputMessages.length, 1);
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts.length, 2);

      // Check first tool call
      assert.strictEqual(outputMessages[0].parts[0].type, "tool_call");
      assert.strictEqual(
        outputMessages[0].parts[0].tool_call.name,
        "getWeather",
      );
      assert.strictEqual(
        outputMessages[0].parts[0].tool_call.arguments,
        '{"location": "San Francisco", "unit": "celsius"}',
      );

      // Check second tool call
      assert.strictEqual(outputMessages[0].parts[1].type, "tool_call");
      assert.strictEqual(
        outputMessages[0].parts[1].tool_call.name,
        "findRestaurants",
      );
      assert.strictEqual(
        outputMessages[0].parts[1].tool_call.arguments,
        '{"location": "San Francisco", "cuisine": "italian"}',
      );
    });

    it("should create both gen_ai.input.messages and gen_ai.output.messages for complete conversation with tools", () => {
      const inputMessages = [
        {
          role: "system",
          content:
            "You are a helpful travel assistant. Use the available tools to help users plan their trips.",
        },
        {
          role: "user",
          content:
            "I'm planning a trip to San Francisco. Can you tell me about the weather and recommend some good Italian restaurants?",
        },
      ];

      const toolCallsData = [
        {
          toolCallType: "function",
          toolCallId: "call_weather_789",
          toolName: "getWeather",
          args: '{"location": "San Francisco", "forecast_days": 3}',
        },
        {
          toolCallType: "function",
          toolCallId: "call_restaurants_101",
          toolName: "searchRestaurants",
          args: '{"location": "San Francisco", "cuisine": "italian", "rating_min": 4.0}',
        },
      ];

      const attributes = {
        "ai.prompt.messages": JSON.stringify(inputMessages),
        "ai.response.toolCalls": JSON.stringify(toolCallsData),
        "ai.prompt.tools": [
          {
            name: "getWeather",
            description: "Get weather forecast for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
                forecast_days: { type: "number" },
              },
              required: ["location"],
            },
          },
          {
            name: "searchRestaurants",
            description: "Search for restaurants in a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
                cuisine: { type: "string" },
                rating_min: { type: "number" },
              },
              required: ["location"],
            },
          },
        ],
      };

      transformLLMSpans(attributes);

      // Check input messages
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_INPUT_MESSAGES],
        "string",
      );
      const parsedInputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_INPUT_MESSAGES],
      );
      assert.strictEqual(parsedInputMessages.length, 2);
      assert.strictEqual(parsedInputMessages[0].role, "system");
      assert.strictEqual(
        parsedInputMessages[0].parts[0].content,
        "You are a helpful travel assistant. Use the available tools to help users plan their trips.",
      );
      assert.strictEqual(parsedInputMessages[1].role, "user");
      assert.strictEqual(
        parsedInputMessages[1].parts[0].content,
        "I'm planning a trip to San Francisco. Can you tell me about the weather and recommend some good Italian restaurants?",
      );

      // Check output messages (tool calls)
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
        "string",
      );
      const parsedOutputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
      );
      assert.strictEqual(parsedOutputMessages.length, 1);
      assert.strictEqual(parsedOutputMessages[0].role, "assistant");
      assert.strictEqual(parsedOutputMessages[0].parts.length, 2);

      // Verify tool calls in output
      assert.strictEqual(parsedOutputMessages[0].parts[0].type, "tool_call");
      assert.strictEqual(
        parsedOutputMessages[0].parts[0].tool_call.name,
        "getWeather",
      );
      assert.strictEqual(parsedOutputMessages[0].parts[1].type, "tool_call");
      assert.strictEqual(
        parsedOutputMessages[0].parts[1].tool_call.name,
        "searchRestaurants",
      );

      // Check that tools are also properly transformed
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.0.name`],
        "getWeather",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.1.name`],
        "searchRestaurants",
      );
    });

    it("should create gen_ai.output.messages for object response", () => {
      const objectResponse = {
        destination: "San Francisco",
        weather: "sunny, 22°C",
        recommendations: ["Visit Golden Gate Bridge", "Try local sourdough"],
        confidence: 0.95,
      };

      const attributes = {
        "ai.response.object": JSON.stringify(objectResponse),
      };

      transformLLMSpans(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_OUTPUT_MESSAGES],
      );
      assert.strictEqual(outputMessages.length, 1);
      assert.strictEqual(outputMessages[0].role, "assistant");
      assert.strictEqual(outputMessages[0].parts.length, 1);
      assert.strictEqual(outputMessages[0].parts[0].type, "text");
      assert.strictEqual(
        outputMessages[0].parts[0].content,
        JSON.stringify(objectResponse),
      );
    });

    it("should handle complex multi-turn conversation with mixed content types", () => {
      const complexMessages = [
        {
          role: "system",
          content: "You are an AI assistant that can analyze images and text.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            { type: "image", url: "data:image/jpeg;base64,..." },
          ],
        },
        {
          role: "assistant",
          content: "I can see a beautiful sunset over a mountain landscape.",
        },
        {
          role: "user",
          content:
            "Can you get the weather for this location using your tools?",
        },
      ];

      const attributes = {
        "ai.prompt.messages": JSON.stringify(complexMessages),
      };

      transformLLMSpans(attributes);

      // Check input messages transformation
      const inputMessages = JSON.parse(
        attributes[SpanAttributes.LLM_INPUT_MESSAGES],
      );
      assert.strictEqual(inputMessages.length, 4);

      // System message should be preserved
      assert.strictEqual(inputMessages[0].role, "system");
      assert.strictEqual(
        inputMessages[0].parts[0].content,
        "You are an AI assistant that can analyze images and text.",
      );

      // Complex content should be flattened to text parts only
      assert.strictEqual(inputMessages[1].role, "user");
      assert.strictEqual(
        inputMessages[1].parts[0].content,
        "What's in this image?",
      );

      // Assistant response should be preserved
      assert.strictEqual(inputMessages[2].role, "assistant");
      assert.strictEqual(
        inputMessages[2].parts[0].content,
        "I can see a beautiful sunset over a mountain landscape.",
      );

      // User follow-up should be preserved
      assert.strictEqual(inputMessages[3].role, "user");
      assert.strictEqual(
        inputMessages[3].parts[0].content,
        "Can you get the weather for this location using your tools?",
      );
    });
  });

  describe("transformAiSdkAttributes - telemetry metadata", () => {
    it("should transform ai.telemetry.metadata.* attributes to association properties", () => {
      const attributes = {
        "ai.telemetry.metadata.userId": "user_123",
        "ai.telemetry.metadata.sessionId": "session_456",
        "ai.telemetry.metadata.experimentId": "exp_789",
        "ai.response.text": "Hello!",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Check that association properties are created
      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`],
        "user_123",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.sessionId`
        ],
        "session_456",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.experimentId`
        ],
        "exp_789",
      );

      // Check that original metadata attributes are removed
      assert.strictEqual(attributes["ai.telemetry.metadata.userId"], undefined);
      assert.strictEqual(
        attributes["ai.telemetry.metadata.sessionId"],
        undefined,
      );
      assert.strictEqual(
        attributes["ai.telemetry.metadata.experimentId"],
        undefined,
      );

      // Check that other transformations still work
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "Hello!",
      );
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should handle non-string metadata values by converting to strings", () => {
      const attributes = {
        "ai.telemetry.metadata.userId": 12345,
        "ai.telemetry.metadata.isActive": true,
        "ai.telemetry.metadata.score": 98.5,
        "ai.telemetry.metadata.config": { key: "value" },
      };

      transformLLMSpans(attributes);

      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`],
        "12345",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.isActive`
        ],
        "true",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.score`],
        "98.5",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.config`],
        "[object Object]",
      );
    });

    it("should ignore metadata attributes with null or undefined values", () => {
      const attributes = {
        "ai.telemetry.metadata.validKey": "valid_value",
        "ai.telemetry.metadata.nullKey": null,
        "ai.telemetry.metadata.undefinedKey": undefined,
        "ai.telemetry.metadata.emptyKey": "",
        someOtherAttr: "value",
      };

      transformLLMSpans(attributes);

      // Valid key should be processed
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.validKey`
        ],
        "valid_value",
      );

      // Empty string should be processed (it's a valid value)
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.emptyKey`
        ],
        "",
      );

      // Null and undefined should not create association properties
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.nullKey`
        ],
        undefined,
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.undefinedKey`
        ],
        undefined,
      );

      // Original attributes should be removed only for processed ones
      assert.strictEqual(
        attributes["ai.telemetry.metadata.validKey"],
        undefined,
      );
      assert.strictEqual(
        attributes["ai.telemetry.metadata.emptyKey"],
        undefined,
      );
      assert.strictEqual(
        attributes["ai.telemetry.metadata.nullKey"],
        undefined,
      );
      assert.strictEqual(
        attributes["ai.telemetry.metadata.undefinedKey"],
        undefined,
      );

      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should work with other transformations in a complete AI SDK call", () => {
      const attributes = {
        "ai.telemetry.metadata.userId": "user_456",
        "ai.telemetry.metadata.sessionId": "session_789",
        "ai.response.text": "I'll help you with that!",
        "ai.prompt.messages": JSON.stringify([
          { role: "user", content: "Help me" },
        ]),
        "ai.usage.promptTokens": 5,
        "ai.usage.completionTokens": 10,
        "ai.model.provider": "openai.chat",
      };

      transformLLMSpans(attributes);

      // Check metadata transformation
      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.userId`],
        "user_456",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.sessionId`
        ],
        "session_789",
      );

      // Check other transformations still work
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        "I'll help you with that!",
      );
      assert.strictEqual(
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Help me",
      );
      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 15);
      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");

      // Check original attributes are removed
      assert.strictEqual(attributes["ai.telemetry.metadata.userId"], undefined);
      assert.strictEqual(
        attributes["ai.telemetry.metadata.sessionId"],
        undefined,
      );
      assert.strictEqual(attributes["ai.response.text"], undefined);
      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
      assert.strictEqual(attributes["ai.model.provider"], undefined);
    });

    it("should detect agent from agent metadata and set agent attributes on root span", () => {
      const attributes = {
        "ai.telemetry.metadata.agent": "research_assistant",
        "ai.telemetry.metadata.sessionId": "session_123",
        "ai.telemetry.metadata.userId": "user_456",
        "ai.response.text": "Hello!",
      };

      // Simulate root span (run.ai - after transformation)
      // Note: In production, span names are transformed before attribute transformation
      transformLLMSpans(attributes, "run.ai");

      // Check that agent attributes are set
      assert.strictEqual(
        attributes[SpanAttributes.GEN_AI_AGENT_NAME],
        "research_assistant",
      );
      assert.strictEqual(
        attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        "agent",
      );

      // Check that association properties are still created
      assert.strictEqual(
        attributes[`${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.agent`],
        "research_assistant",
      );
      assert.strictEqual(
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.sessionId`
        ],
        "session_123",
      );
    });

    it("should set agent name but not span kind on child spans", () => {
      const attributes = {
        "ai.telemetry.metadata.agent": "research_assistant",
        "ai.telemetry.metadata.sessionId": "session_123",
        "ai.response.text": "Hello!",
      };

      // Simulate child span (text.generate - after transformation)
      // Note: In production, span names are transformed before attribute transformation
      transformLLMSpans(attributes, "text.generate");

      // Agent name should be set for context
      assert.strictEqual(
        attributes[SpanAttributes.GEN_AI_AGENT_NAME],
        "research_assistant",
      );

      // But span kind should NOT be set on child spans
      assert.strictEqual(
        attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        undefined,
      );
    });

    it("should not set agent attributes when no agent metadata is present", () => {
      const attributes = {
        "ai.telemetry.metadata.sessionId": "session_123",
        "ai.telemetry.metadata.userId": "user_456",
        "ai.response.text": "Hello!",
      };

      transformLLMSpans(attributes);

      // Agent attributes should not be set
      assert.strictEqual(
        attributes[SpanAttributes.GEN_AI_AGENT_NAME],
        undefined,
      );
      assert.strictEqual(
        attributes[SpanAttributes.TRACELOOP_SPAN_KIND],
        undefined,
      );
    });
  });
});
