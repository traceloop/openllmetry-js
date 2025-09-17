import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_GENERATE_OBJECT_DO_GENERATE = "ai.generateObject.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const HANDLED_SPAN_NAMES: Record<string, string> = {
  [AI_GENERATE_TEXT_DO_GENERATE]: "ai.generateText.generate",
  [AI_GENERATE_OBJECT_DO_GENERATE]: "ai.generateObject.generate",
  [AI_STREAM_TEXT_DO_STREAM]: "ai.streamText.stream",
};

const AI_RESPONSE_TEXT = "ai.response.text";
const AI_RESPONSE_OBJECT = "ai.response.object";
const AI_RESPONSE_TOOL_CALLS = "ai.response.toolCalls";
const AI_PROMPT_MESSAGES = "ai.prompt.messages";
const AI_PROMPT = "ai.prompt";
const AI_USAGE_PROMPT_TOKENS = "ai.usage.promptTokens";
const AI_USAGE_COMPLETION_TOKENS = "ai.usage.completionTokens";
const AI_MODEL_PROVIDER = "ai.model.provider";
const AI_PROMPT_TOOLS = "ai.prompt.tools";
const TYPE_TEXT = "text";
const TYPE_TOOL_CALL = "tool_call";
const ROLE_ASSISTANT = "assistant";
const ROLE_USER = "user";

// Vendor mapping from AI SDK provider prefixes to standardized LLM_SYSTEM values
// Uses prefixes to match AI SDK patterns like "openai.chat", "anthropic.messages", etc.
const VENDOR_MAPPING: Record<string, string> = {
  openai: "OpenAI",
  "azure-openai": "Azure",
  anthropic: "Anthropic",
  cohere: "Cohere",
  mistral: "MistralAI",
  groq: "Groq",
  replicate: "Replicate",
  together: "TogetherAI",
  fireworks: "Fireworks",
  deepseek: "DeepSeek",
  perplexity: "Perplexity",
  "amazon-bedrock": "AWS",
  bedrock: "AWS",
  google: "Google",
  vertex: "Google",
  ollama: "Ollama",
  huggingface: "HuggingFace",
  openrouter: "OpenRouter",
};

export const transformAiSdkSpanName = (span: ReadableSpan): void => {
  // Unfortunately, the span name is not writable as this is not the intended behavior
  // but it is a workaround to set the correct span name
  if (span.name in HANDLED_SPAN_NAMES) {
    (span as any).name = HANDLED_SPAN_NAMES[span.name];
  }
};

const transformResponseText = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TEXT in attributes) {
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] =
      attributes[AI_RESPONSE_TEXT];
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = ROLE_ASSISTANT;

    const outputMessage = {
      role: ROLE_ASSISTANT,
      parts: [
        {
          type: TYPE_TEXT,
          content: attributes[AI_RESPONSE_TEXT],
        },
      ],
    };
    attributes[SpanAttributes.LLM_OUTPUT_MESSAGES] = JSON.stringify([
      outputMessage,
    ]);

    delete attributes[AI_RESPONSE_TEXT];
  }
};

const transformResponseObject = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_OBJECT in attributes) {
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] =
      attributes[AI_RESPONSE_OBJECT];
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = ROLE_ASSISTANT;

    const outputMessage = {
      role: ROLE_ASSISTANT,
      parts: [
        {
          type: TYPE_TEXT,
          content: attributes[AI_RESPONSE_OBJECT],
        },
      ],
    };
    attributes[SpanAttributes.LLM_OUTPUT_MESSAGES] = JSON.stringify([
      outputMessage,
    ]);

    delete attributes[AI_RESPONSE_OBJECT];
  }
};

const transformResponseToolCalls = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TOOL_CALLS in attributes) {
    try {
      const toolCalls = JSON.parse(
        attributes[AI_RESPONSE_TOOL_CALLS] as string,
      );

      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = ROLE_ASSISTANT;

      const toolCallParts: any[] = [];
      toolCalls.forEach((toolCall: any, index: number) => {
        if (toolCall.toolCallType === "function") {
          attributes[
            `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.${index}.name`
          ] = toolCall.toolName;
          attributes[
            `${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.${index}.arguments`
          ] = toolCall.args;

          toolCallParts.push({
            type: TYPE_TOOL_CALL,
            tool_call: {
              name: toolCall.toolName,
              arguments: toolCall.args,
            },
          });
        }
      });

      if (toolCallParts.length > 0) {
        const outputMessage = {
          role: ROLE_ASSISTANT,
          parts: toolCallParts,
        };
        attributes[SpanAttributes.LLM_OUTPUT_MESSAGES] = JSON.stringify([
          outputMessage,
        ]);
      }

      delete attributes[AI_RESPONSE_TOOL_CALLS];
    } catch {
      // Ignore parsing errors
    }
  }
};

const processMessageContent = (content: any): string => {
  if (Array.isArray(content)) {
    const textItems = content.filter(
      (item: any) =>
        item &&
        typeof item === "object" &&
        item.type === TYPE_TEXT &&
        item.text,
    );

    if (textItems.length > 0) {
      const joinedText = textItems.map((item: any) => item.text).join(" ");
      return joinedText;
    } else {
      return JSON.stringify(content);
    }
  }

  if (content && typeof content === "object") {
    if (content.type === TYPE_TEXT && content.text) {
      return content.text;
    }
    return JSON.stringify(content);
  }

  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const allTextItems = parsed.every(
          (item: any) =>
            item &&
            typeof item === "object" &&
            item.type === TYPE_TEXT &&
            item.text,
        );

        if (allTextItems && parsed.length > 0) {
          return parsed.map((item: any) => item.text).join(" ");
        } else {
          return content;
        }
      }
    } catch {
      // Ignore parsing errors
    }

    return content;
  }

  return String(content);
};

const transformTools = (attributes: Record<string, any>): void => {
  if (AI_PROMPT_TOOLS in attributes) {
    try {
      const tools = attributes[AI_PROMPT_TOOLS];
      if (Array.isArray(tools)) {
        tools.forEach((toolItem: any, index: number) => {
          let tool = toolItem;
          if (typeof toolItem === "string") {
            try {
              tool = JSON.parse(toolItem);
            } catch {
              return;
            }
          }

          if (tool && typeof tool === "object") {
            if (tool.name) {
              attributes[
                `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`
              ] = tool.name;
            }

            if (tool.description) {
              attributes[
                `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`
              ] = tool.description;
            }

            if (tool.parameters) {
              attributes[
                `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.parameters`
              ] =
                typeof tool.parameters === "string"
                  ? tool.parameters
                  : JSON.stringify(tool.parameters);
            }
          }
        });
      }
      delete attributes[AI_PROMPT_TOOLS];
    } catch {
      // Ignore parsing errors
    }
  }
};

const transformPrompts = (attributes: Record<string, any>): void => {
  if (AI_PROMPT_MESSAGES in attributes) {
    try {
      let jsonString = attributes[AI_PROMPT_MESSAGES] as string;

      try {
        JSON.parse(jsonString);
      } catch {
        jsonString = jsonString.replace(/\\'/g, "'");
        jsonString = jsonString.replace(/\\\\\\\\/g, "\\\\");
      }

      const messages = JSON.parse(jsonString);
      const inputMessages: any[] = [];

      messages.forEach((msg: { role: string; content: any }, index: number) => {
        const processedContent = processMessageContent(msg.content);
        const contentKey = `${SpanAttributes.LLM_PROMPTS}.${index}.content`;
        attributes[contentKey] = processedContent;
        attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] = msg.role;

        // Add to OpenTelemetry standard gen_ai.input.messages format
        inputMessages.push({
          role: msg.role,
          parts: [
            {
              type: TYPE_TEXT,
              content: processedContent,
            },
          ],
        });
      });

      // Set the OpenTelemetry standard input messages attribute
      if (inputMessages.length > 0) {
        attributes[SpanAttributes.LLM_INPUT_MESSAGES] =
          JSON.stringify(inputMessages);
      }

      delete attributes[AI_PROMPT_MESSAGES];
    } catch {
      // Ignore parsing errors
    }
  }

  if (AI_PROMPT in attributes) {
    try {
      const promptData = JSON.parse(attributes[AI_PROMPT] as string);
      if (promptData.prompt && typeof promptData.prompt === "string") {
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] =
          promptData.prompt;
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = ROLE_USER;

        const inputMessage = {
          role: ROLE_USER,
          parts: [
            {
              type: TYPE_TEXT,
              content: promptData.prompt,
            },
          ],
        };
        attributes[SpanAttributes.LLM_INPUT_MESSAGES] = JSON.stringify([
          inputMessage,
        ]);

        delete attributes[AI_PROMPT];
      }
    } catch {
      // Ignore parsing errors
    }
  }
};

const transformPromptTokens = (attributes: Record<string, any>): void => {
  if (AI_USAGE_PROMPT_TOKENS in attributes) {
    attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`] =
      attributes[AI_USAGE_PROMPT_TOKENS];
    delete attributes[AI_USAGE_PROMPT_TOKENS];
  }
};

const transformCompletionTokens = (attributes: Record<string, any>): void => {
  if (AI_USAGE_COMPLETION_TOKENS in attributes) {
    attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`] =
      attributes[AI_USAGE_COMPLETION_TOKENS];
    delete attributes[AI_USAGE_COMPLETION_TOKENS];
  }
};

const calculateTotalTokens = (attributes: Record<string, any>): void => {
  const promptTokens = attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`];
  const completionTokens =
    attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`];

  if (promptTokens && completionTokens) {
    attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`] =
      Number(promptTokens) + Number(completionTokens);
  }
};

const transformVendor = (attributes: Record<string, any>): void => {
  if (AI_MODEL_PROVIDER in attributes) {
    const vendor = attributes[AI_MODEL_PROVIDER];

    // Find matching vendor prefix in mapping
    let mappedVendor = null;
    if (typeof vendor === "string" && vendor.length > 0) {
      for (const prefix of Object.keys(VENDOR_MAPPING)) {
        if (vendor.startsWith(prefix)) {
          mappedVendor = VENDOR_MAPPING[prefix];
          break;
        }
      }
    }

    attributes[SpanAttributes.LLM_SYSTEM] = mappedVendor || vendor;
    delete attributes[AI_MODEL_PROVIDER];
  }
};

export const transformAiSdkAttributes = (
  attributes: Record<string, any>,
): void => {
  transformResponseText(attributes);
  transformResponseObject(attributes);
  transformResponseToolCalls(attributes);
  transformPrompts(attributes);
  transformTools(attributes);
  transformPromptTokens(attributes);
  transformCompletionTokens(attributes);
  calculateTotalTokens(attributes);
  transformVendor(attributes);
};

const shouldHandleSpan = (span: ReadableSpan): boolean => {
  return span.name in HANDLED_SPAN_NAMES;
};

export const transformAiSdkSpan = (span: ReadableSpan): void => {
  if (!shouldHandleSpan(span)) {
    return;
  }
  transformAiSdkSpanName(span);
  transformAiSdkAttributes(span.attributes);
};
