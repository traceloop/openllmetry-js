import { ReadableSpan, Span } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const AI_GENERATE_TEXT = "ai.generateText";
const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_GENERATE_OBJECT_DO_GENERATE = "ai.generateObject.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const HANDLED_SPAN_NAMES: Record<string, string> = {
  [AI_GENERATE_TEXT]: "run.ai",
  [AI_GENERATE_TEXT_DO_GENERATE]: "text.generate",
  [AI_GENERATE_OBJECT_DO_GENERATE]: "object.generate",
  [AI_STREAM_TEXT_DO_STREAM]: "text.stream",
};

const TOOL_SPAN_NAME = "ai.toolCall";

const AI_RESPONSE_TEXT = "ai.response.text";
const AI_RESPONSE_OBJECT = "ai.response.object";
const AI_RESPONSE_TOOL_CALLS = "ai.response.toolCalls";
const AI_PROMPT_MESSAGES = "ai.prompt.messages";
const AI_PROMPT = "ai.prompt";
const AI_USAGE_PROMPT_TOKENS = "ai.usage.promptTokens";
const AI_USAGE_COMPLETION_TOKENS = "ai.usage.completionTokens";
const AI_MODEL_PROVIDER = "ai.model.provider";
const AI_MODEL_ID = "ai.model.id";
const AI_PROMPT_TOOLS = "ai.prompt.tools";
const AI_TELEMETRY_METADATA_PREFIX = "ai.telemetry.metadata.";
const AI_TELEMETRY_FUNCTION_ID = "ai.telemetry.functionId";
const AI_RESPONSE_PROVIDER_METADATA = "ai.response.providerMetadata";
const AI_RESPONSE_ID = "ai.response.id";
const AI_RESPONSE_MODEL = "ai.response.model";
const AI_RESPONSE_FINISH_REASON = "ai.response.finishReason";
const GEN_AI_SYSTEM = "gen_ai.system";
const TYPE_TEXT = "text";
const TYPE_TOOL_CALL = "tool_call";
const ROLE_ASSISTANT = "assistant";
const ROLE_USER = "user";
const ROLE_SYSTEM = "system";

// OTel GenAI provider name mapping
// Maps AI SDK provider prefixes to OpenTelemetry standard provider names
// See: https://opentelemetry.io/docs/specs/semconv/attributes-registry/gen-ai/
const OTEL_PROVIDER_MAPPING: Record<string, string> = {
  openai: "openai",
  "azure-openai": "azure.ai.openai",
  anthropic: "anthropic",
  cohere: "cohere",
  mistral: "mistral_ai",
  groq: "groq",
  deepseek: "deepseek",
  perplexity: "perplexity",
  "amazon-bedrock": "aws.bedrock",
  bedrock: "aws.bedrock",
  google: "gcp.vertex_ai",
  vertex: "gcp.vertex_ai",
};

// Legacy vendor mapping for backward compatibility (deprecated attribute names)
const LEGACY_VENDOR_MAPPING: Record<string, string> = {
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

/**
 * Adds gen_ai.operation.name attribute based on AI SDK span name
 */
const addOperationName = (
  spanName: string,
  attributes: Record<string, any>,
): void => {
  // Map AI SDK span names to OTel operation names
  const operationMapping: Record<string, string> = {
    [AI_GENERATE_TEXT_DO_GENERATE]: "chat",
    [AI_GENERATE_OBJECT_DO_GENERATE]: "generate_content",
    [AI_STREAM_TEXT_DO_STREAM]: "chat",
    "ai.embed.doEmbed": "embeddings",
    "ai.embedMany.doEmbed": "embeddings",
  };

  const operation = operationMapping[spanName] || "chat";
  attributes[SpanAttributes.GEN_AI_OPERATION_NAME] = operation;
};

/**
 * Transforms ai.model.id to gen_ai.request.model
 */
const transformModelId = (attributes: Record<string, any>): void => {
  if (AI_MODEL_ID in attributes) {
    // Set as gen_ai.request.model if not already set by AI SDK
    if (!attributes[SpanAttributes.GEN_AI_REQUEST_MODEL]) {
      attributes[SpanAttributes.GEN_AI_REQUEST_MODEL] =
        attributes[AI_MODEL_ID];
    }
    delete attributes[AI_MODEL_ID];
  }
};

/**
 * Transforms ai.telemetry.functionId to traceloop.entity.name
 */
const transformFunctionId = (attributes: Record<string, any>): void => {
  if (AI_TELEMETRY_FUNCTION_ID in attributes) {
    // Map to traceloop entity name for consistency with other instrumentations
    attributes[SpanAttributes.TRACELOOP_ENTITY_NAME] =
      attributes[AI_TELEMETRY_FUNCTION_ID];
    delete attributes[AI_TELEMETRY_FUNCTION_ID];
  }
};

/**
 * Transforms ai.response.providerMetadata to a custom gen_ai attribute
 */
const transformProviderMetadata = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_PROVIDER_METADATA in attributes) {
    // Store as provider.metadata under gen_ai namespace
    attributes["gen_ai.provider.metadata"] =
      attributes[AI_RESPONSE_PROVIDER_METADATA];
    delete attributes[AI_RESPONSE_PROVIDER_METADATA];
  }
};

/**
 * Transforms AI SDK response metadata attributes to OTel format
 */
const transformResponseMetadata = (attributes: Record<string, any>): void => {
  // Transform response ID
  if (AI_RESPONSE_ID in attributes) {
    attributes[SpanAttributes.GEN_AI_RESPONSE_ID] =
      attributes[AI_RESPONSE_ID];
    delete attributes[AI_RESPONSE_ID];
  }

  // Transform response model
  if (AI_RESPONSE_MODEL in attributes) {
    attributes[SpanAttributes.GEN_AI_RESPONSE_MODEL] =
      attributes[AI_RESPONSE_MODEL];
    delete attributes[AI_RESPONSE_MODEL];
  }

  // Transform finish reason to finish reasons array
  if (AI_RESPONSE_FINISH_REASON in attributes) {
    const finishReason = attributes[AI_RESPONSE_FINISH_REASON];
    // OTel expects an array of finish reasons
    attributes[SpanAttributes.GEN_AI_RESPONSE_FINISH_REASONS] = [finishReason];
    delete attributes[AI_RESPONSE_FINISH_REASON];
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

    // Set new OTel attribute
    attributes[SpanAttributes.GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
      outputMessage,
    ]);

    // Set deprecated attribute for backward compatibility
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

    // Set new OTel attribute
    attributes[SpanAttributes.GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
      outputMessage,
    ]);

    // Set deprecated attribute for backward compatibility
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

        // Set new OTel attribute
        attributes[SpanAttributes.GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
          outputMessage,
        ]);

        // Set deprecated attribute for backward compatibility
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
        // Create OTel-compliant tool definitions structure
        const toolDefinitions: any[] = [];

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
            // Add to structured tool definitions for OTel
            const toolDef: any = {
              type: tool.type || "function",
            };

            if (tool.type === "function" || !tool.type) {
              toolDef.function = {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              };
            }

            toolDefinitions.push(toolDef);

            // Also keep flat format for backward compatibility
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

        // Set OTel-compliant tool definitions attribute
        if (toolDefinitions.length > 0) {
          attributes[SpanAttributes.GEN_AI_TOOL_DEFINITIONS] =
            JSON.stringify(toolDefinitions);
        }
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
      const systemInstructions: any[] = [];

      messages.forEach((msg: { role: string; content: any }, index: number) => {
        const processedContent = processMessageContent(msg.content);
        const contentKey = `${SpanAttributes.LLM_PROMPTS}.${index}.content`;
        attributes[contentKey] = processedContent;
        attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] = msg.role;

        const messagePart = {
          type: TYPE_TEXT,
          content: processedContent,
        };

        // Separate system messages into system instructions per OTel spec
        if (msg.role === ROLE_SYSTEM) {
          systemInstructions.push({
            role: ROLE_SYSTEM,
            parts: [messagePart],
          });
        } else {
          // Non-system messages go to input messages
          inputMessages.push({
            role: msg.role,
            parts: [messagePart],
          });
        }
      });

      // Set system instructions separately (OTel spec)
      if (systemInstructions.length > 0) {
        attributes[SpanAttributes.GEN_AI_SYSTEM_INSTRUCTIONS] =
          JSON.stringify(systemInstructions);
      }

      // Set the OpenTelemetry standard input messages attribute
      // Note: For backward compatibility, we include all messages here
      // but OTel spec recommends separating system messages
      const allMessages = [...systemInstructions, ...inputMessages];
      if (allMessages.length > 0) {
        attributes[SpanAttributes.GEN_AI_INPUT_MESSAGES] =
          JSON.stringify(allMessages);
        // Also set deprecated attribute for backward compatibility
        attributes[SpanAttributes.LLM_INPUT_MESSAGES] =
          JSON.stringify(allMessages);
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

        // Set new OTel attribute
        attributes[SpanAttributes.GEN_AI_INPUT_MESSAGES] = JSON.stringify([
          inputMessage,
        ]);

        // Set deprecated attribute for backward compatibility
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
    const value = attributes[AI_USAGE_PROMPT_TOKENS];

    // Set new OTel-compliant attribute
    attributes[SpanAttributes.GEN_AI_USAGE_INPUT_TOKENS] = value;

    // Set deprecated attribute for backward compatibility
    attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS] = value;

    delete attributes[AI_USAGE_PROMPT_TOKENS];
  }
};

const transformCompletionTokens = (attributes: Record<string, any>): void => {
  if (AI_USAGE_COMPLETION_TOKENS in attributes) {
    const value = attributes[AI_USAGE_COMPLETION_TOKENS];

    // Set new OTel-compliant attribute
    attributes[SpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS] = value;

    // Set deprecated attribute for backward compatibility
    attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS] = value;

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
  let providerValue: string | null = null;

  // Check if AI SDK already set gen_ai.system (deprecated attribute)
  // AI SDK emits this in "Call LLM Span Information"
  if (GEN_AI_SYSTEM in attributes) {
    providerValue = attributes[GEN_AI_SYSTEM] as string;
    delete attributes[GEN_AI_SYSTEM]; // Remove deprecated attribute
  } else if (AI_MODEL_PROVIDER in attributes) {
    // Otherwise get from ai.model.provider
    providerValue = attributes[AI_MODEL_PROVIDER] as string;
    delete attributes[AI_MODEL_PROVIDER];
  }

  if (typeof providerValue === "string") {
    // Handle empty string case
    if (providerValue.length === 0) {
      attributes[SpanAttributes.GEN_AI_PROVIDER_NAME] = "";
      attributes[SpanAttributes.LLM_SYSTEM] = "";
      return;
    }

    // Find matching provider prefix for OTel standard name
    let otelProvider: string | null = null;
    let legacyProvider: string | null = null;

    for (const prefix of Object.keys(OTEL_PROVIDER_MAPPING)) {
      if (providerValue.toLowerCase().startsWith(prefix)) {
        otelProvider = OTEL_PROVIDER_MAPPING[prefix];
        legacyProvider = LEGACY_VENDOR_MAPPING[prefix];
        break;
      }
    }

    // Set new OTel-compliant provider name
    attributes[SpanAttributes.GEN_AI_PROVIDER_NAME] =
      otelProvider || providerValue;

    // Set deprecated attribute for backward compatibility
    attributes[SpanAttributes.LLM_SYSTEM] =
      legacyProvider || providerValue;
  }
};

const transformTelemetryMetadata = (attributes: Record<string, any>): void => {
  const metadataAttributes: Record<string, string> = {};
  const keysToDelete: string[] = [];

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

  // Remove original ai.telemetry.metadata.* attributes
  keysToDelete.forEach((key) => {
    delete attributes[key];
  });

  // Note: Context setting for child span inheritance should be done before span creation,
  // not during transformation. Use `withTelemetryMetadataContext` function for context propagation.
};

export const transformLLMSpans = (
  attributes: Record<string, any>,
  spanName?: string,
): void => {
  // Add operation name first (required OTel attribute)
  if (spanName) {
    addOperationName(spanName, attributes);
  }

  // Transform AI SDK-specific attributes
  transformModelId(attributes);
  transformFunctionId(attributes);
  transformProviderMetadata(attributes);
  transformResponseMetadata(attributes);

  // Transform request/response content
  transformResponseText(attributes);
  transformResponseObject(attributes);
  transformResponseToolCalls(attributes);
  transformPrompts(attributes);
  transformTools(attributes);

  // Transform usage metrics
  transformPromptTokens(attributes);
  transformCompletionTokens(attributes);
  calculateTotalTokens(attributes);

  // Transform vendor/provider (must be after tokens for backward compat)
  transformVendor(attributes);

  // Transform metadata
  transformTelemetryMetadata(attributes);
};

const transformToolCalls = (span: ReadableSpan): void => {
  if (
    span.attributes["ai.toolCall.args"] &&
    span.attributes["ai.toolCall.result"]
  ) {
    span.attributes[SpanAttributes.TRACELOOP_ENTITY_INPUT] =
      span.attributes["ai.toolCall.args"];
    delete span.attributes["ai.toolCall.args"];
    span.attributes[SpanAttributes.TRACELOOP_ENTITY_OUTPUT] =
      span.attributes["ai.toolCall.result"];
    delete span.attributes["ai.toolCall.result"];
  }
};

const shouldHandleSpan = (span: ReadableSpan): boolean => {
  return span.instrumentationScope?.name === "ai";
};

export const transformAiSdkSpanNames = (span: Span): void => {
  if (span.name === TOOL_SPAN_NAME) {
    span.updateName(`${span.attributes["ai.toolCall.name"] as string}.tool`);
    return;
  }

  if (span.name in HANDLED_SPAN_NAMES) {
    const newBaseName = HANDLED_SPAN_NAMES[span.name];

    // Try to append model name for OTel compliance: "{operation} {model}"
    const model =
      span.attributes[AI_MODEL_ID] ||
      span.attributes[SpanAttributes.GEN_AI_REQUEST_MODEL];

    if (model && typeof model === "string") {
      // Append model to create OTel-compliant name
      span.updateName(`${newBaseName} ${model}`);
    } else {
      span.updateName(newBaseName);
    }
  }
};

export const transformAiSdkSpanAttributes = (span: ReadableSpan): void => {
  if (!shouldHandleSpan(span)) {
    return;
  }
  // Pass span name to transformations so operation name can be set
  transformLLMSpans(span.attributes, span.name);
  transformToolCalls(span);
};
