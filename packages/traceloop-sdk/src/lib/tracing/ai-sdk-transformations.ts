import { ReadableSpan, Span } from "@opentelemetry/sdk-trace-node";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_COMPLETION,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROMPT,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";

const AI_GENERATE_TEXT = "ai.generateText";
const AI_STREAM_TEXT = "ai.streamText";
const AI_GENERATE_OBJECT = "ai.generateObject";
const AI_STREAM_OBJECT = "ai.streamObject";
const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_GENERATE_OBJECT_DO_GENERATE = "ai.generateObject.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const AI_STREAM_OBJECT_DO_STREAM = "ai.streamObject.doStream";
const HANDLED_SPAN_NAMES: Record<string, string> = {
  [AI_GENERATE_TEXT]: "run.ai",
  [AI_STREAM_TEXT]: "stream.ai",
  [AI_GENERATE_OBJECT]: "object.ai",
  [AI_STREAM_OBJECT]: "stream-object.ai",
  [AI_GENERATE_TEXT_DO_GENERATE]: "text.generate",
  [AI_GENERATE_OBJECT_DO_GENERATE]: "object.generate",
  [AI_STREAM_TEXT_DO_STREAM]: "text.stream",
  [AI_STREAM_OBJECT_DO_STREAM]: "object.stream",
};

const TOOL_SPAN_NAME = "ai.toolCall";

const AI_RESPONSE_TEXT = "ai.response.text";
const AI_RESPONSE_OBJECT = "ai.response.object";
const AI_RESPONSE_TOOL_CALLS = "ai.response.toolCalls";
const AI_RESPONSE_PROVIDER_METADATA = "ai.response.providerMetadata";
const AI_PROMPT_MESSAGES = "ai.prompt.messages";
const AI_PROMPT = "ai.prompt";
const AI_USAGE_PROMPT_TOKENS = "ai.usage.promptTokens";
const AI_USAGE_COMPLETION_TOKENS = "ai.usage.completionTokens";
const AI_MODEL_PROVIDER = "ai.model.provider";
const AI_PROMPT_TOOLS = "ai.prompt.tools";
const AI_TELEMETRY_METADATA_PREFIX = "ai.telemetry.metadata.";
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

const getAgentNameFromAttributes = (
  attributes: Record<string, any>,
): string | null => {
  const agentAttr = attributes[`${AI_TELEMETRY_METADATA_PREFIX}agent`];
  return agentAttr && typeof agentAttr === "string" ? agentAttr : null;
};

const transformResponseText = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TEXT in attributes) {
    attributes[`${ATTR_GEN_AI_COMPLETION}.0.content`] =
      attributes[AI_RESPONSE_TEXT];
    attributes[`${ATTR_GEN_AI_COMPLETION}.0.role`] = ROLE_ASSISTANT;

    const outputMessage = {
      role: ROLE_ASSISTANT,
      parts: [
        {
          type: TYPE_TEXT,
          content: attributes[AI_RESPONSE_TEXT],
        },
      ],
    };
    attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([outputMessage]);

    delete attributes[AI_RESPONSE_TEXT];
  }
};

const transformResponseObject = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_OBJECT in attributes) {
    attributes[`${ATTR_GEN_AI_COMPLETION}.0.content`] =
      attributes[AI_RESPONSE_OBJECT];
    attributes[`${ATTR_GEN_AI_COMPLETION}.0.role`] = ROLE_ASSISTANT;

    const outputMessage = {
      role: ROLE_ASSISTANT,
      parts: [
        {
          type: TYPE_TEXT,
          content: attributes[AI_RESPONSE_OBJECT],
        },
      ],
    };
    attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([outputMessage]);

    delete attributes[AI_RESPONSE_OBJECT];
  }
};

const transformResponseToolCalls = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TOOL_CALLS in attributes) {
    try {
      const toolCalls = JSON.parse(
        attributes[AI_RESPONSE_TOOL_CALLS] as string,
      );

      attributes[`${ATTR_GEN_AI_COMPLETION}.0.role`] = ROLE_ASSISTANT;

      const toolCallParts: any[] = [];
      toolCalls.forEach((toolCall: any, index: number) => {
        if (toolCall.toolCallType === "function") {
          // Support both v4 (args) and v5 (input) formats
          // Prefer v5 (input) if present
          const toolArgs = toolCall.input ?? toolCall.args;

          attributes[`${ATTR_GEN_AI_COMPLETION}.0.tool_calls.${index}.name`] =
            toolCall.toolName;
          attributes[
            `${ATTR_GEN_AI_COMPLETION}.0.tool_calls.${index}.arguments`
          ] = toolArgs;

          toolCallParts.push({
            type: TYPE_TOOL_CALL,
            tool_call: {
              name: toolCall.toolName,
              arguments: toolArgs,
            },
          });
        }
      });

      if (toolCallParts.length > 0) {
        const outputMessage = {
          role: ROLE_ASSISTANT,
          parts: toolCallParts,
        };
        attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
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

            // Support both v4 (parameters) and v5 (inputSchema) formats
            // Prefer v5 (inputSchema) if present
            const schema = tool.inputSchema ?? tool.parameters;
            if (schema) {
              attributes[
                `${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.parameters`
              ] =
                typeof schema === "string" ? schema : JSON.stringify(schema);
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
        const contentKey = `${ATTR_GEN_AI_PROMPT}.${index}.content`;
        attributes[contentKey] = processedContent;
        attributes[`${ATTR_GEN_AI_PROMPT}.${index}.role`] = msg.role;

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
        attributes[ATTR_GEN_AI_INPUT_MESSAGES] = JSON.stringify(inputMessages);
      }

      delete attributes[AI_PROMPT_MESSAGES];
    } catch {
      // Ignore parsing errors
    }
  }

  if (AI_PROMPT in attributes) {
    try {
      const promptData = JSON.parse(attributes[AI_PROMPT] as string);
      if (promptData.messages && Array.isArray(promptData.messages)) {
        const messages = promptData.messages;
        const inputMessages: any[] = [];

        messages.forEach(
          (msg: { role: string; content: any }, index: number) => {
            const processedContent = processMessageContent(msg.content);
            const contentKey = `${ATTR_GEN_AI_PROMPT}.${index}.content`;
            attributes[contentKey] = processedContent;
            attributes[`${ATTR_GEN_AI_PROMPT}.${index}.role`] = msg.role;

            inputMessages.push({
              role: msg.role,
              parts: [
                {
                  type: TYPE_TEXT,
                  content: processedContent,
                },
              ],
            });
          },
        );

        if (inputMessages.length > 0) {
          attributes[ATTR_GEN_AI_INPUT_MESSAGES] =
            JSON.stringify(inputMessages);
        }

        delete attributes[AI_PROMPT];
      } else if (promptData.prompt && typeof promptData.prompt === "string") {
        attributes[`${ATTR_GEN_AI_PROMPT}.0.content`] = promptData.prompt;
        attributes[`${ATTR_GEN_AI_PROMPT}.0.role`] = ROLE_USER;

        const inputMessage = {
          role: ROLE_USER,
          parts: [
            {
              type: TYPE_TEXT,
              content: promptData.prompt,
            },
          ],
        };
        attributes[ATTR_GEN_AI_INPUT_MESSAGES] = JSON.stringify([inputMessage]);

        delete attributes[AI_PROMPT];
      }
    } catch {
      // Ignore parsing errors
    }
  }
};

const transformPromptTokens = (attributes: Record<string, any>): void => {
  if (
    !(ATTR_GEN_AI_USAGE_INPUT_TOKENS in attributes) &&
    AI_USAGE_PROMPT_TOKENS in attributes
  ) {
    attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] =
      attributes[AI_USAGE_PROMPT_TOKENS];
  }

  delete attributes[AI_USAGE_PROMPT_TOKENS];
};

const transformCompletionTokens = (attributes: Record<string, any>): void => {
  if (
    !(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in attributes) &&
    AI_USAGE_COMPLETION_TOKENS in attributes
  ) {
    attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS] =
      attributes[AI_USAGE_COMPLETION_TOKENS];
  }

  delete attributes[AI_USAGE_COMPLETION_TOKENS];
};

const transformProviderMetadata = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_PROVIDER_METADATA in attributes) {
    try {
      const metadataStr = attributes[AI_RESPONSE_PROVIDER_METADATA];
      let metadata: any;

      if (typeof metadataStr === "string") {
        metadata = JSON.parse(metadataStr);
      } else if (typeof metadataStr === "object") {
        metadata = metadataStr;
      } else {
        return;
      }

      if (metadata.anthropic) {
        const anthropicMetadata = metadata.anthropic;

        if (anthropicMetadata.cacheCreationInputTokens !== undefined) {
          attributes[SpanAttributes.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS] =
            anthropicMetadata.cacheCreationInputTokens;
        }

        if (anthropicMetadata.cacheReadInputTokens !== undefined) {
          attributes[SpanAttributes.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] =
            anthropicMetadata.cacheReadInputTokens;
        }
      }

      if (metadata.openai) {
        const openaiMetadata = metadata.openai;

        if (openaiMetadata.cachedPromptTokens !== undefined) {
          attributes[SpanAttributes.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] =
            openaiMetadata.cachedPromptTokens;
        }

        if (openaiMetadata.reasoningTokens !== undefined) {
          attributes[SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS] =
            openaiMetadata.reasoningTokens;
        }
      }

      delete attributes[AI_RESPONSE_PROVIDER_METADATA];
    } catch {
      // Ignore JSON parsing errors
    }
  }
};

const calculateTotalTokens = (attributes: Record<string, any>): void => {
  const inputTokens = attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS];
  const outputTokens = attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS];

  if (inputTokens && outputTokens) {
    attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`] =
      Number(inputTokens) + Number(outputTokens);
  }
};

const transformVendor = (attributes: Record<string, any>): void => {
  if (AI_MODEL_PROVIDER in attributes) {
    const vendor = attributes[AI_MODEL_PROVIDER];

    // Find matching vendor prefix in mapping
    let mappedVendor = null;
    let providerName = vendor;
    if (typeof vendor === "string" && vendor.length > 0) {
      // Extract provider name (part before first dot, or entire string if no dot)
      const dotIndex = vendor.indexOf(".");
      providerName = dotIndex > 0 ? vendor.substring(0, dotIndex) : vendor;

      for (const prefix of Object.keys(VENDOR_MAPPING)) {
        if (vendor.startsWith(prefix)) {
          mappedVendor = VENDOR_MAPPING[prefix];
          break;
        }
      }

      attributes[ATTR_GEN_AI_SYSTEM] = mappedVendor || vendor;
      attributes[ATTR_GEN_AI_PROVIDER_NAME] = providerName;
    }

    delete attributes[AI_MODEL_PROVIDER];
  }
};

const transformOperationName = (
  attributes: Record<string, any>,
  spanName?: string,
): void => {
  if (!spanName) return;

  let operationName: string | undefined;
  if (
    spanName.includes("generateText") ||
    spanName.includes("streamText") ||
    spanName.includes("generateObject") ||
    spanName.includes("streamObject")
  ) {
    operationName = "chat";
  } else if (spanName === "ai.toolCall" || spanName.endsWith(".tool")) {
    operationName = "execute_tool";
  }

  if (operationName) {
    attributes[ATTR_GEN_AI_OPERATION_NAME] = operationName;
  }
};

const transformModelId = (attributes: Record<string, any>): void => {
  const AI_MODEL_ID = "ai.model.id";
  if (AI_MODEL_ID in attributes) {
    attributes[ATTR_GEN_AI_REQUEST_MODEL] = attributes[AI_MODEL_ID];
    delete attributes[AI_MODEL_ID];
  }
};

const transformFinishReason = (attributes: Record<string, any>): void => {
  const AI_RESPONSE_FINISH_REASON = "ai.response.finishReason";
  if (AI_RESPONSE_FINISH_REASON in attributes) {
    const finishReason = attributes[AI_RESPONSE_FINISH_REASON];
    attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] = Array.isArray(
      finishReason,
    )
      ? finishReason
      : [finishReason];
    delete attributes[AI_RESPONSE_FINISH_REASON];
  }
};

const transformToolCallAttributes = (attributes: Record<string, any>): void => {
  if ("ai.toolCall.name" in attributes) {
    attributes[ATTR_GEN_AI_TOOL_NAME] = attributes["ai.toolCall.name"];
    // Keep ai.toolCall.name for now, will be deleted in transformToolCalls
  }

  if ("ai.toolCall.id" in attributes) {
    attributes[ATTR_GEN_AI_TOOL_CALL_ID] = attributes["ai.toolCall.id"];
    delete attributes["ai.toolCall.id"];
  }

  // Support both v4 (args) and v5 (input) formats
  // Prefer v5 (input) if present
  const toolArgs =
    attributes["ai.toolCall.input"] ?? attributes["ai.toolCall.args"];
  if (toolArgs !== undefined) {
    attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = toolArgs;
    // Don't delete yet - transformToolCalls will handle entity input/output
  }

  // Support both v4 (result) and v5 (output) formats
  // Prefer v5 (output) if present
  const toolResult =
    attributes["ai.toolCall.output"] ?? attributes["ai.toolCall.result"];
  if (toolResult !== undefined) {
    attributes[ATTR_GEN_AI_TOOL_CALL_RESULT] = toolResult;
    // Don't delete yet - transformToolCalls will handle entity input/output
  }
};

const transformConversationId = (attributes: Record<string, any>): void => {
  const conversationId = attributes["ai.telemetry.metadata.conversationId"];
  const sessionId = attributes["ai.telemetry.metadata.sessionId"];

  if (conversationId) {
    attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversationId;
  } else if (sessionId) {
    attributes[ATTR_GEN_AI_CONVERSATION_ID] = sessionId;
  }
};

const transformResponseMetadata = (attributes: Record<string, any>): void => {
  const AI_RESPONSE_MODEL = "ai.response.model";
  const AI_RESPONSE_ID = "ai.response.id";

  if (AI_RESPONSE_MODEL in attributes) {
    attributes[ATTR_GEN_AI_RESPONSE_MODEL] = attributes[AI_RESPONSE_MODEL];
    delete attributes[AI_RESPONSE_MODEL];
  }

  if (AI_RESPONSE_ID in attributes) {
    attributes[ATTR_GEN_AI_RESPONSE_ID] = attributes[AI_RESPONSE_ID];
    delete attributes[AI_RESPONSE_ID];
  }
};

const transformTelemetryMetadata = (
  attributes: Record<string, any>,
  spanName?: string,
): void => {
  const metadataAttributes: Record<string, string> = {};
  const keysToDelete: string[] = [];
  // Use the helper function to extract agent name
  const agentName = getAgentNameFromAttributes(attributes);

  // Find all ai.telemetry.metadata.* attributes
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith(AI_TELEMETRY_METADATA_PREFIX)) {
      const metadataKey = key.substring(AI_TELEMETRY_METADATA_PREFIX.length);

      // Always mark for deletion since it's a telemetry metadata attribute
      keysToDelete.push(key);

      if (metadataKey && value != null) {
        // Convert value to string for association properties
        const stringValue = typeof value === "string" ? value : String(value);
        metadataAttributes[metadataKey] = stringValue;

        // Also set as traceloop association property attribute
        attributes[
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.${metadataKey}`
        ] = stringValue;
      }
    }
  }

  if (agentName) {
    attributes[ATTR_GEN_AI_AGENT_NAME] = agentName;

    const topLevelSpanNames = [
      AI_GENERATE_TEXT,
      AI_STREAM_TEXT,
      AI_GENERATE_OBJECT,
      AI_STREAM_OBJECT,
    ];

    if (
      spanName &&
      (spanName === `${agentName}.agent` ||
        topLevelSpanNames.includes(spanName))
    ) {
      attributes[SpanAttributes.TRACELOOP_SPAN_KIND] =
        TraceloopSpanKindValues.AGENT;
      attributes[SpanAttributes.TRACELOOP_ENTITY_NAME] = agentName;

      const inputMessages = attributes[ATTR_GEN_AI_INPUT_MESSAGES];
      const outputMessages = attributes[ATTR_GEN_AI_OUTPUT_MESSAGES];
      const toolArgs = attributes["ai.toolCall.args"];
      const toolResult = attributes["ai.toolCall.result"];

      if (inputMessages || outputMessages) {
        if (inputMessages) {
          attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT] = inputMessages;
        }
        if (outputMessages) {
          attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT] = outputMessages;
        }
      } else if (toolArgs || toolResult) {
        if (toolArgs) {
          attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT] = toolArgs;
        }
        if (toolResult) {
          attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT] = toolResult;
        }
      }
    }
  }

  keysToDelete.forEach((key) => {
    delete attributes[key];
  });
};

export const transformLLMSpans = (
  attributes: Record<string, any>,
  spanName?: string,
): void => {
  transformOperationName(attributes, spanName);
  transformModelId(attributes);
  transformResponseText(attributes);
  transformResponseObject(attributes);
  transformResponseToolCalls(attributes);
  transformPrompts(attributes);
  transformTools(attributes);
  transformPromptTokens(attributes);
  transformCompletionTokens(attributes);
  transformProviderMetadata(attributes);
  transformFinishReason(attributes);
  transformResponseMetadata(attributes);
  calculateTotalTokens(attributes);
  transformVendor(attributes); // Also sets GEN_AI_PROVIDER_NAME
  transformConversationId(attributes);
  transformToolCallAttributes(attributes);
  transformTelemetryMetadata(attributes, spanName);
};

const transformToolCalls = (span: ReadableSpan): void => {
  // Support both v4 (args/result) and v5 (input/output) formats
  // Prefer v5 (input/output) if present
  const toolInput =
    span.attributes["ai.toolCall.input"] ?? span.attributes["ai.toolCall.args"];
  const toolOutput =
    span.attributes["ai.toolCall.output"] ??
    span.attributes["ai.toolCall.result"];

  if (toolInput && toolOutput) {
    span.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT] = toolInput;
    delete span.attributes["ai.toolCall.args"];
    delete span.attributes["ai.toolCall.input"];
    span.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT] = toolOutput;
    delete span.attributes["ai.toolCall.result"];
    delete span.attributes["ai.toolCall.output"];
    span.attributes[SpanAttributes.TRACELOOP_SPAN_KIND] =
      TraceloopSpanKindValues.TOOL;

    // Set entity name from tool call name
    const toolName = span.attributes["ai.toolCall.name"];
    if (toolName) {
      span.attributes[SpanAttributes.TRACELOOP_ENTITY_NAME] = toolName;
      delete span.attributes["ai.toolCall.name"];
    }
  }
};

const shouldHandleSpan = (span: ReadableSpan): boolean => {
  return span.instrumentationScope?.name === "ai";
};

const TOP_LEVEL_AI_SPANS = [
  AI_GENERATE_TEXT,
  AI_STREAM_TEXT,
  AI_GENERATE_OBJECT,
  AI_STREAM_OBJECT,
];

export const transformAiSdkSpanNames = (span: Span): void => {
  if (span.name === TOOL_SPAN_NAME) {
    span.updateName(`${span.attributes["ai.toolCall.name"] as string}.tool`);
  }
  if (span.name in HANDLED_SPAN_NAMES) {
    const agentName = getAgentNameFromAttributes(span.attributes);
    const isTopLevelSpan = TOP_LEVEL_AI_SPANS.includes(span.name);

    if (agentName && isTopLevelSpan) {
      span.updateName(`${agentName}.agent`);
    } else if (!isTopLevelSpan) {
      span.updateName(HANDLED_SPAN_NAMES[span.name]);
    }
  }
};

export const transformAiSdkSpanAttributes = (span: ReadableSpan): void => {
  if (!shouldHandleSpan(span)) {
    return;
  }
  transformLLMSpans(span.attributes, span.name);
  transformToolCalls(span);
};
