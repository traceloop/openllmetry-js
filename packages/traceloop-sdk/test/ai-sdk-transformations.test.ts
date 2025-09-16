import * as assert from "assert";
import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import {ATTR_GEN_AI_INPUT_MESSAGES} from "@opentelemetry/semantic-conventions";
import {ATTR_GEN_AI_OUTPUT_MESSAGES} from "@opentelemetry/semantic-conventions";

import {
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
  describe("transformAiSdkAttributes - response text", () => {
    it("should transform ai.response.text to completion attributes", () => {
      const attributes = {
        "ai.response.text": "Hello, how can I help you?",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty response text", () => {
      const attributes = {
        "ai.response.text": "",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle invalid JSON gracefully", () => {
      const attributes = {
        "ai.response.toolCalls": "invalid json {",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      // Should not modify attributes when JSON parsing fails
      assert.strictEqual(attributes["ai.prompt.messages"], "invalid json {");
      assert.strictEqual(attributes.someOtherAttr, "value");
    });

    it("should not modify attributes when ai.prompt.messages is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty messages array", () => {
      const attributes = {
        "ai.prompt.messages": JSON.stringify([]),
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(attributes["ai.prompt.messages"], undefined);
    });

    it("should unescape JSON escape sequences in simple string content", () => {
      const attributes = {
        "ai.prompt.messages":
          '[{"role":"user","content":[{"type":"text","text":"Help me plan a trip to San Francisco. I\'d like to know:\\n1. What\'s the weather like there?\\n2. Find some good restaurants to try\\n3. If I\'m traveling from New York, how far is it?\\n\\nPlease use the available tools to get current information and provide a comprehensive travel guide."}]}]',
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle invalid JSON gracefully", () => {
      const attributes = {
        "ai.prompt": "invalid json {",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero prompt tokens", () => {
      const attributes = {
        "ai.usage.promptTokens": 0,
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS], 0);
    });
  });

  describe("transformAiSdkAttributes - completion tokens", () => {
    it("should transform ai.usage.completionTokens to LLM usage attribute", () => {
      const attributes = {
        "ai.usage.completionTokens": 25,
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle zero completion tokens", () => {
      const attributes = {
        "ai.usage.completionTokens": 0,
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should handle string token values", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: "50",
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: "25",
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS], 75);
    });

    it("should not calculate total when prompt tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: 25,
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when completion tokens are missing", () => {
      const attributes = {
        [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: 50,
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        undefined,
      );
    });

    it("should not calculate total when both tokens are missing", () => {
      const attributes = {};

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

        transformAiSdkAttributes(attributes);

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

        transformAiSdkAttributes(attributes);

        assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Azure");
        assert.strictEqual(attributes["ai.model.provider"], undefined);
      });
    });

    it("should transform other providers to their value", () => {
      const attributes = {
        "ai.model.provider": "anthropic",
      };

      transformAiSdkAttributes(attributes);

      assert.strictEqual(attributes[SpanAttributes.LLM_SYSTEM], "Anthropic");
      assert.strictEqual(attributes["ai.model.provider"], undefined);
    });

    it("should not modify attributes when ai.model.provider is not present", () => {
      const attributes = {
        someOtherAttr: "value",
      };
      const originalAttributes = { ...attributes };

      transformAiSdkAttributes(attributes);

      assert.deepStrictEqual(attributes, originalAttributes);
    });

    it("should handle empty provider value", () => {
      const attributes = {
        "ai.model.provider": "",
      };

      transformAiSdkAttributes(attributes);

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

    it("should apply all attribute transformations for generateObject", () => {
      const attributes = {
        "ai.response.object": '{"result":"Hello!"}',
        "ai.prompt.messages": JSON.stringify([{ role: "user", content: "Hi" }]),
        "ai.usage.promptTokens": 10,
        "ai.usage.completionTokens": 5,
        "ai.model.provider": "azure-openai.chat",
        someOtherAttr: "value",
      };

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

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

      transformAiSdkAttributes(attributes);

      // Check that gen_ai.input.messages is properly set
      assert.strictEqual(
        typeof attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        "string",
      );

      const inputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_INPUT_MESSAGES],
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

      transformAiSdkAttributes(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
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

      transformAiSdkAttributes(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
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

      transformAiSdkAttributes(attributes);

      // Check input messages
      assert.strictEqual(
        typeof attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        "string",
      );
      const parsedInputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_INPUT_MESSAGES],
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
        typeof attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        "string",
      );
      const parsedOutputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
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

      transformAiSdkAttributes(attributes);

      // Check that gen_ai.output.messages is properly set
      assert.strictEqual(
        typeof attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        "string",
      );

      const outputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
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

      transformAiSdkAttributes(attributes);

      // Check input messages transformation
      const inputMessages = JSON.parse(
        attributes[ATTR_GEN_AI_INPUT_MESSAGES],
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

    it("should transform generateObject span name and attributes", () => {
      const span = createMockSpan("ai.generateObject.doGenerate", {
        "ai.prompt.format": "prompt",
        "llm.usage.output_tokens": "39",
        "traceloop.workflow.name": "generate_person_profile",
        "llm.request.model": "gpt-4o",
        "ai.settings.maxRetries": "2",
        "ai.usage.promptTokens": "108",
        "operation.name": "ai.generateObject.doGenerate",
        "llm.response.id": "chatcmpl-C82mjzq1hNM753oc4VkStnjEzzLpk",
        "ai.response.providerMetadata":
          '{"openai":{"reasoningTokens":0,"acceptedPredictionTokens":0,"rejectedPredictionTokens":0,"cachedPromptTokens":0}}',
        "ai.operationId": "ai.generateObject.doGenerate",
        "ai.response.id": "chatcmpl-C82mjzq1hNM753oc4VkStnjEzzLpk",
        "ai.usage.completionTokens": "39",
        "ai.response.model": "gpt-4o-2024-08-06",
        "ai.response.object":
          '{"name":"Alex Dupont","age":30,"occupation":"Software Engineer","skills":["AI","Machine Learning","Programming","Multilingual"],"location":{"city":"Paris","country":"France"}}',
        "ai.prompt.messages":
          '[{"role":"user","content":[{"type":"text","text":"Based on this description, generate a detailed person profile: A talented software engineer from Paris who loves working with AI and machine learning, speaks multiple languages, and enjoys traveling."}]}]',
        "ai.settings.mode": "tool",
        "llm.vendor": "openai.chat",
        "ai.response.timestamp": "2025-08-24T11:02:45.000Z",
        "llm.response.model": "gpt-4o-2024-08-06",
        "ai.model.id": "gpt-4o",
        "ai.response.finishReason": "stop",
        "ai.model.provider": "openai.chat",
        "llm.usage.input_tokens": "108",
      });

      transformAiSdkSpan(span);

      // Check span name transformation
      assert.strictEqual(span.name, "ai.generateObject.generate");

      // Check attribute transformations
      assert.strictEqual(
        span.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`],
        '{"name":"Alex Dupont","age":30,"occupation":"Software Engineer","skills":["AI","Machine Learning","Programming","Multilingual"],"location":{"city":"Paris","country":"France"}}',
      );
      assert.strictEqual(
        span.attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`],
        "assistant",
      );
      assert.strictEqual(
        span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`],
        "Based on this description, generate a detailed person profile: A talented software engineer from Paris who loves working with AI and machine learning, speaks multiple languages, and enjoys traveling.",
      );
      assert.strictEqual(
        span.attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`],
        "user",
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS],
        "108",
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS],
        "39",
      );
      assert.strictEqual(
        span.attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS],
        147,
      );
      assert.strictEqual(span.attributes[SpanAttributes.LLM_SYSTEM], "OpenAI");

      // Check that original AI SDK attributes are removed
      assert.strictEqual(span.attributes["ai.response.object"], undefined);
      assert.strictEqual(span.attributes["ai.prompt.messages"], undefined);
      assert.strictEqual(span.attributes["ai.usage.promptTokens"], undefined);
      assert.strictEqual(
        span.attributes["ai.usage.completionTokens"],
        undefined,
      );
      assert.strictEqual(span.attributes["ai.model.provider"], undefined);
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
