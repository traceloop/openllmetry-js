import { ReadableSpan, Span } from "@opentelemetry/sdk-trace-node";
import {
  SpanAttributes,
  TraceloopSpanKindValues,
} from "@traceloop/ai-semantic-conventions";
import { mapAiSdkMessageContent } from "@traceloop/instrumentation-utils";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
  GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GROQ,
  GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY,
} from "@opentelemetry/semantic-conventions/incubating";

const AI_GENERATE_TEXT = "ai.generateText";
const AI_STREAM_TEXT = "ai.streamText";
const AI_GENERATE_OBJECT = "ai.generateObject";
const AI_STREAM_OBJECT = "ai.streamObject";
const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_GENERATE_OBJECT_DO_GENERATE = "ai.generateObject.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const AI_STREAM_OBJECT_DO_STREAM = "ai.streamObject.doStream";
// Span names emitted by the AI SDK that we rename to OTel 1.40 format.
// Only membership is checked (not values) — using a Set is correct.
const HANDLED_SPAN_NAMES = new Set([
  AI_GENERATE_TEXT,
  AI_STREAM_TEXT,
  AI_GENERATE_OBJECT,
  AI_STREAM_OBJECT,
  AI_GENERATE_TEXT_DO_GENERATE,
  AI_GENERATE_OBJECT_DO_GENERATE,
  AI_STREAM_TEXT_DO_STREAM,
  AI_STREAM_OBJECT_DO_STREAM,
]);

const TOOL_SPAN_NAME = "ai.toolCall";

const AI_RESPONSE_FINISH_REASON = "ai.response.finishReason";

// Maps AI SDK finish reason values to OTel 1.40 finish_reason enum values
const aiSdkFinishReasonMap: Record<string, string> = {
  stop: "stop",
  length: "length",
  "content-filter": "content_filter",
  "tool-calls": "tool_call", // AI SDK v4 format (hyphen)
  tool_calls: "tool_call", // alternative format (underscore)
  error: "error",
};

// Returns mapped finish reason for output message JSON.
// Per OTel spec, finish_reason is required on OutputMessage — use "" when unavailable.
const getMappedFinishReason = (attributes: Record<string, any>): string => {
  const raw = attributes[AI_RESPONSE_FINISH_REASON];
  if (raw == null) return "";
  return aiSdkFinishReasonMap[raw as string] ?? (raw as string);
};

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

// Maps AI SDK provider prefixes to OTel 1.40 gen_ai.provider.name well-known constants.
// Prefixes are the part before the first dot in ai.model.provider (e.g. "openai" from "openai.chat").
// See https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/ for the full list.
const PROVIDER_NAME_MAPPING: Record<string, string> = {
  openai: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  anthropic: GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  azure: GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  "azure-openai": GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  google: GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  vertex: GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  "amazon-bedrock": GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  bedrock: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  cohere: GEN_AI_PROVIDER_NAME_VALUE_COHERE,
  mistral: GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI,
  groq: GEN_AI_PROVIDER_NAME_VALUE_GROQ,
  deepseek: GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  perplexity: GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY,
};

/**
 * Sets a span attribute only if it is not already present and value is non-null.
 *
 * We use this instead of direct assignment for every gen_ai.* attribute write because:
 *
 * 1. ai@6+ emits gen_ai.* attributes natively on doGenerate/doStream spans
 *    (e.g. gen_ai.usage.input_tokens, gen_ai.response.finish_reasons, gen_ai.request.model).
 *    Without this guard our transformer would silently overwrite correctly-set values.
 *
 * 2. Users who opt into @ai-sdk/otel (the official Vercel AI SDK OTel integration package)
 *    get gen_ai.* attributes set by that package before our span processor runs.
 *    Again, we must not clobber those values.
 *
 * The rule: if the SDK already got it right, we stay out of the way.
 */
const setIfAbsent = (
  attributes: Record<string, any>,
  key: string,
  value: any,
): void => {
  if (!(key in attributes) && value != null) {
    attributes[key] = value;
  }
};

const getAgentNameFromAttributes = (
  attributes: Record<string, any>,
): string | null => {
  const agentAttr = attributes[`${AI_TELEMETRY_METADATA_PREFIX}agent`];
  return agentAttr && typeof agentAttr === "string" ? agentAttr : null;
};

const transformResponseText = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TEXT in attributes) {
    const outputMessage = {
      role: ROLE_ASSISTANT,
      finish_reason: getMappedFinishReason(attributes),
      parts: [{ type: TYPE_TEXT, content: attributes[AI_RESPONSE_TEXT] }],
    };
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_OUTPUT_MESSAGES,
      JSON.stringify([outputMessage]),
    );
    delete attributes[AI_RESPONSE_TEXT];
  }
};

const transformResponseObject = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_OBJECT in attributes) {
    const outputMessage = {
      role: ROLE_ASSISTANT,
      finish_reason: getMappedFinishReason(attributes),
      parts: [{ type: TYPE_TEXT, content: attributes[AI_RESPONSE_OBJECT] }],
    };
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_OUTPUT_MESSAGES,
      JSON.stringify([outputMessage]),
    );
    delete attributes[AI_RESPONSE_OBJECT];
  }
};

const transformResponseToolCalls = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_TOOL_CALLS in attributes) {
    try {
      const toolCalls = JSON.parse(
        attributes[AI_RESPONSE_TOOL_CALLS] as string,
      );
      const finishReason = getMappedFinishReason(attributes);

      const toolCallParts: any[] = [];
      toolCalls.forEach((toolCall: any) => {
        // Support both v4 (args) and v5 (input) formats
        // Prefer v5 (input) if present
        const toolArgs = toolCall.input ?? toolCall.args;

        // Per OTel spec, arguments must be an OBJECT, not a JSON string
        let parsedArgs: any = toolArgs;
        if (typeof toolArgs === "string") {
          try {
            parsedArgs = JSON.parse(toolArgs);
          } catch {
            parsedArgs = toolArgs;
          }
        }

        toolCallParts.push({
          type: TYPE_TOOL_CALL,
          name: toolCall.toolName,
          id: toolCall.toolCallId ?? null,
          arguments: parsedArgs,
        });
      });

      if (toolCallParts.length > 0) {
        const outputMessage = {
          role: ROLE_ASSISTANT,
          finish_reason: finishReason,
          parts: toolCallParts,
        };
        setIfAbsent(
          attributes,
          ATTR_GEN_AI_OUTPUT_MESSAGES,
          JSON.stringify([outputMessage]),
        );
      }

      delete attributes[AI_RESPONSE_TOOL_CALLS];
    } catch {
      // Ignore parsing errors
    }
  }
};

const transformTools = (attributes: Record<string, any>): void => {
  if (AI_PROMPT_TOOLS in attributes) {
    try {
      const tools = attributes[AI_PROMPT_TOOLS];
      if (Array.isArray(tools)) {
        // Preserve source tool format as per OTel 1.40 spec:
        // "The value of this attribute matches source system tool definition format."
        const toolDefs: object[] = [];
        tools.forEach((toolItem: any) => {
          let tool = toolItem;
          if (typeof toolItem === "string") {
            try {
              tool = JSON.parse(toolItem);
            } catch {
              return;
            }
          }
          if (tool && typeof tool === "object") {
            toolDefs.push(tool);
          }
        });
        if (toolDefs.length > 0) {
          setIfAbsent(
            attributes,
            ATTR_GEN_AI_TOOL_DEFINITIONS,
            JSON.stringify(toolDefs),
          );
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

      messages.forEach((msg: { role: string; content: any }) => {
        inputMessages.push({
          role: msg.role,
          parts: mapAiSdkMessageContent(msg.content),
        });
      });

      // Set the OpenTelemetry standard input messages attribute
      if (inputMessages.length > 0) {
        setIfAbsent(
          attributes,
          ATTR_GEN_AI_INPUT_MESSAGES,
          JSON.stringify(inputMessages),
        );
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

        messages.forEach((msg: { role: string; content: any }) => {
          inputMessages.push({
            role: msg.role,
            parts: mapAiSdkMessageContent(msg.content),
          });
        });

        if (inputMessages.length > 0) {
          setIfAbsent(
            attributes,
            ATTR_GEN_AI_INPUT_MESSAGES,
            JSON.stringify(inputMessages),
          );
        }

        delete attributes[AI_PROMPT];
      } else if (promptData.prompt && typeof promptData.prompt === "string") {
        const inputMessage = {
          role: ROLE_USER,
          parts: [{ type: TYPE_TEXT, content: promptData.prompt }],
        };
        setIfAbsent(
          attributes,
          ATTR_GEN_AI_INPUT_MESSAGES,
          JSON.stringify([inputMessage]),
        );
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
          setIfAbsent(
            attributes,
            ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
            anthropicMetadata.cacheCreationInputTokens,
          );
        }

        if (anthropicMetadata.cacheReadInputTokens !== undefined) {
          setIfAbsent(
            attributes,
            ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
            anthropicMetadata.cacheReadInputTokens,
          );
        }
      }

      if (metadata.openai) {
        const openaiMetadata = metadata.openai;

        if (openaiMetadata.cachedPromptTokens !== undefined) {
          setIfAbsent(
            attributes,
            ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
            openaiMetadata.cachedPromptTokens,
          );
        }

        if (openaiMetadata.reasoningTokens !== undefined) {
          setIfAbsent(
            attributes,
            SpanAttributes.GEN_AI_USAGE_REASONING_TOKENS,
            openaiMetadata.reasoningTokens,
          );
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

  if (inputTokens != null && outputTokens != null) {
    setIfAbsent(
      attributes,
      SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
      Number(inputTokens) + Number(outputTokens),
    );
  }
};

const transformVendor = (attributes: Record<string, any>): void => {
  if (AI_MODEL_PROVIDER in attributes) {
    const vendor = attributes[AI_MODEL_PROVIDER];

    if (typeof vendor === "string" && vendor.length > 0) {
      // Extract the prefix before the first dot (e.g. "openai" from "openai.chat")
      const dotIndex = vendor.indexOf(".");
      const providerPrefix =
        dotIndex > 0 ? vendor.substring(0, dotIndex) : vendor;
      // Map to OTel 1.40 well-known gen_ai.provider.name value; fall back to raw prefix
      setIfAbsent(
        attributes,
        ATTR_GEN_AI_PROVIDER_NAME,
        PROVIDER_NAME_MAPPING[providerPrefix] ?? providerPrefix,
      );
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
    operationName = GEN_AI_OPERATION_NAME_VALUE_CHAT;
  } else if (
    spanName === "ai.toolCall" ||
    spanName.endsWith(".tool") ||
    spanName.startsWith(GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL)
  ) {
    operationName = GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL;
  }

  if (operationName) {
    setIfAbsent(attributes, ATTR_GEN_AI_OPERATION_NAME, operationName);
  }
};

const transformModelId = (attributes: Record<string, any>): void => {
  const AI_MODEL_ID = "ai.model.id";
  if (AI_MODEL_ID in attributes) {
    setIfAbsent(attributes, ATTR_GEN_AI_REQUEST_MODEL, attributes[AI_MODEL_ID]);
    delete attributes[AI_MODEL_ID];
  }
};

const transformFinishReason = (attributes: Record<string, any>): void => {
  if (AI_RESPONSE_FINISH_REASON in attributes) {
    const raw = attributes[AI_RESPONSE_FINISH_REASON];
    const reasons: string[] = Array.isArray(raw) ? raw : [raw];
    // Apply the same mapping used for output message finish_reason
    const mapped = reasons.map((r: string) => aiSdkFinishReasonMap[r] ?? r);
    setIfAbsent(attributes, ATTR_GEN_AI_RESPONSE_FINISH_REASONS, mapped);
    delete attributes[AI_RESPONSE_FINISH_REASON];
  }
};


const transformToolCallAttributes = (attributes: Record<string, any>): void => {
  if ("ai.toolCall.name" in attributes) {
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_TOOL_NAME,
      attributes["ai.toolCall.name"],
    );
    // Keep ai.toolCall.name for now, will be deleted in transformToolCalls
  }

  if ("ai.toolCall.id" in attributes) {
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_TOOL_CALL_ID,
      attributes["ai.toolCall.id"],
    );
    delete attributes["ai.toolCall.id"];
  }

  // Support both v4 (args) and v5 (input) formats
  // Prefer v5 (input) if present
  const toolArgs =
    attributes["ai.toolCall.input"] ?? attributes["ai.toolCall.args"];
  if (toolArgs !== undefined) {
    setIfAbsent(attributes, ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, toolArgs);
    // Don't delete yet - transformToolCalls will handle entity input/output
  }

  // Support both v4 (result) and v5 (output) formats
  // Prefer v5 (output) if present
  const toolResult =
    attributes["ai.toolCall.output"] ?? attributes["ai.toolCall.result"];
  if (toolResult !== undefined) {
    setIfAbsent(attributes, ATTR_GEN_AI_TOOL_CALL_RESULT, toolResult);
    // Don't delete yet - transformToolCalls will handle entity input/output
  }
};

const transformConversationId = (attributes: Record<string, any>): void => {
  const conversationId = attributes["ai.telemetry.metadata.conversationId"];
  const sessionId = attributes["ai.telemetry.metadata.sessionId"];

  if (conversationId) {
    setIfAbsent(attributes, ATTR_GEN_AI_CONVERSATION_ID, conversationId);
  } else if (sessionId) {
    setIfAbsent(attributes, ATTR_GEN_AI_CONVERSATION_ID, sessionId);
  }
};

const transformResponseMetadata = (attributes: Record<string, any>): void => {
  const AI_RESPONSE_MODEL = "ai.response.model";
  const AI_RESPONSE_ID = "ai.response.id";

  if (AI_RESPONSE_MODEL in attributes) {
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_RESPONSE_MODEL,
      attributes[AI_RESPONSE_MODEL],
    );
    delete attributes[AI_RESPONSE_MODEL];
  }

  if (AI_RESPONSE_ID in attributes) {
    setIfAbsent(
      attributes,
      ATTR_GEN_AI_RESPONSE_ID,
      attributes[AI_RESPONSE_ID],
    );
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
    setIfAbsent(attributes, ATTR_GEN_AI_AGENT_NAME, agentName);

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

let _cachedAiSdkVersion: string | undefined;
let _aiSdkVersionResolved = false;

const getAiSdkVersion = (): string | undefined => {
  if (!_aiSdkVersionResolved) {
    try {
      _cachedAiSdkVersion = require("ai/package.json").version;
    } catch {
      _cachedAiSdkVersion = undefined;
    }
    _aiSdkVersionResolved = true;
  }
  return _cachedAiSdkVersion;
};

const TOP_LEVEL_AI_SPANS = [
  AI_GENERATE_TEXT,
  AI_STREAM_TEXT,
  AI_GENERATE_OBJECT,
  AI_STREAM_OBJECT,
];

export const transformAiSdkSpanNames = (span: Span): void => {
  if (span.name === TOOL_SPAN_NAME) {
    const toolName = span.attributes["ai.toolCall.name"] as string;
    span.updateName(
      `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL}${toolName ? ` ${toolName}` : ""}`,
    );
    return;
  }

  if (HANDLED_SPAN_NAMES.has(span.name)) {
    const agentName = getAgentNameFromAttributes(span.attributes);
    const isTopLevelSpan = TOP_LEVEL_AI_SPANS.includes(span.name);

    if (agentName && isTopLevelSpan) {
      // Traceloop-specific agent span naming — keep as-is
      span.updateName(`${agentName}.agent`);
    } else {
      // OTel 1.40 span name format: "{operation} {model}"
      const model = span.attributes["ai.model.id"] as string | undefined;
      const operation = GEN_AI_OPERATION_NAME_VALUE_CHAT;
      span.updateName(model ? `${operation} ${model}` : operation);
    }
  }
};

export const transformAiSdkSpanAttributes = (span: ReadableSpan): void => {
  if (!shouldHandleSpan(span)) {
    return;
  }

  const aiSdkVersion = getAiSdkVersion();
  if (aiSdkVersion) {
    span.attributes["ai.sdk.version"] = aiSdkVersion;
  }

  transformLLMSpans(span.attributes, span.name);
  transformToolCalls(span);
};
