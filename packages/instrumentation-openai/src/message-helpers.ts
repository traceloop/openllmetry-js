/**
 * OpenAI-specific message builders for OTel gen_ai attributes.
 *
 * OpenAI's API has a different structure from block-based providers:
 * - Input messages have typed content parts (user only), but system/developer/tool
 *   messages need special handling
 * - Response messages are flat (content is string, tool_calls/refusal/audio are separate fields)
 *
 * These builders convert OpenAI SDK shapes into OTel-shaped objects,
 * which are then serialized by the shared serializers in instrumentation-utils.
 */

import { mapOpenAIContentBlock } from "@traceloop/instrumentation-utils";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";

// =============================================================================
// OTel message shape types
// =============================================================================

interface OTelChatMessage {
  role: string;
  parts: object[];
}

interface OTelOutputMessage {
  role: string;
  finish_reason: string;
  parts: object[];
}

// =============================================================================
// Finish reason mapping
// =============================================================================

/**
 * Maps OpenAI-specific finish reasons to OTel standard values.
 */
export const openaiFinishReasonMap: Record<string, string> = {
  stop: FinishReasons.STOP,
  length: FinishReasons.LENGTH,
  tool_calls: FinishReasons.TOOL_CALL,
  content_filter: FinishReasons.CONTENT_FILTER,
  function_call: FinishReasons.TOOL_CALL, // deprecated but still exists
};

// =============================================================================
// Input message builder
// =============================================================================

/**
 * Converts OpenAI SDK request messages into OTel-shaped input messages.
 *
 * Per the OTel spec: "Instructions that are part of the chat history SHOULD be
 * recorded in gen_ai.input.messages attribute instead [of gen_ai.system_instructions]."
 *
 * OpenAI puts system/developer messages IN the chat history (messages array),
 * not as a separate parameter, so they stay in gen_ai.input.messages.
 *
 * @param messages - The messages array from the OpenAI chat completion request
 * @returns Array of OTel-shaped chat messages
 */
export function buildOpenAIInputMessages(messages: any[]): OTelChatMessage[] {
  const inputMessages: OTelChatMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      // -----------------------------------------------------------------
      // System / Developer — kept in input messages per OTel spec
      // (OpenAI puts these in the chat history, not as a separate param)
      // -----------------------------------------------------------------
      case "system":
      case "developer": {
        const parts =
          typeof msg.content === "string"
            ? [{ type: "text", content: msg.content }]
            : Array.isArray(msg.content)
              ? msg.content.map(mapOpenAIContentBlock)
              : [];
        inputMessages.push({ role: msg.role, parts });
        break;
      }

      // -----------------------------------------------------------------
      // User → map content parts via mapOpenAIContentBlock
      // -----------------------------------------------------------------
      case "user": {
        const parts =
          typeof msg.content === "string"
            ? [{ type: "text", content: msg.content }]
            : Array.isArray(msg.content)
              ? msg.content.map(mapOpenAIContentBlock)
              : [];
        inputMessages.push({ role: "user", parts });
        break;
      }

      // -----------------------------------------------------------------
      // Assistant → combine content + tool_calls into parts array
      // In multi-turn conversations, assistant messages may include
      // tool_calls that were previously returned by the model.
      // -----------------------------------------------------------------
      case "assistant": {
        const parts: object[] = [];

        // Text content
        if (typeof msg.content === "string" && msg.content) {
          parts.push({ type: "text", content: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            parts.push(mapOpenAIContentBlock(block));
          }
        }

        // Tool calls (from previous model response, sent back in multi-turn)
        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            if (tc.type === "function" && tc.function) {
              parts.push({
                type: "tool_call",
                id: tc.id,
                name: tc.function.name,
                arguments: safeJsonParse(tc.function.arguments),
              });
            } else if (tc.type === "custom" && tc.custom) {
              parts.push({
                type: "tool_call",
                id: tc.id,
                name: tc.custom.name,
                arguments: tc.custom.input,
              });
            }
          }
        }

        // Deprecated function_call
        if (msg.function_call) {
          parts.push({
            type: "tool_call",
            name: msg.function_call.name,
            arguments: safeJsonParse(msg.function_call.arguments),
          });
        }

        inputMessages.push({ role: "assistant", parts });
        break;
      }

      // -----------------------------------------------------------------
      // Tool → wrap as tool_call_response with tool_call_id
      // -----------------------------------------------------------------
      case "tool": {
        const response =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        inputMessages.push({
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: msg.tool_call_id,
              response,
            },
          ],
        });
        break;
      }

      // -----------------------------------------------------------------
      // Deprecated function role
      // -----------------------------------------------------------------
      case "function": {
        inputMessages.push({
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: msg.name,
              response: msg.content,
            },
          ],
        });
        break;
      }

      // -----------------------------------------------------------------
      // Unknown role — pass through with text content
      // -----------------------------------------------------------------
      default: {
        const parts =
          typeof msg.content === "string"
            ? [{ type: "text", content: msg.content }]
            : Array.isArray(msg.content)
              ? msg.content.map(mapOpenAIContentBlock)
              : [];
        inputMessages.push({ role: msg.role, parts });
        break;
      }
    }
  }

  return inputMessages;
}

// =============================================================================
// Output message builder
// =============================================================================

/**
 * Assembles an OTel output message from OpenAI's flat response fields.
 *
 * OpenAI's ChatCompletionMessage has:
 *   content: string | null        → TextPart
 *   refusal: string | null        → GenericPart {type: "refusal"}
 *   tool_calls: ToolCall[]        → ToolCallRequestPart[]
 *   audio: {data, transcript}     → BlobPart {modality: "audio"}
 *   function_call: {name, args}   → ToolCallRequestPart (deprecated)
 *
 * @param choice - A single ChatCompletion.Choice
 * @param finishReasonMap - Mapping of OpenAI finish reasons to OTel standard values
 * @returns Array with a single OTelOutputMessage
 */
export function buildOpenAIOutputMessage(
  choice: any,
  finishReasonMap: Record<string, string>,
): OTelOutputMessage[] {
  const parts: object[] = [];
  const message = choice.message;

  // Text content
  if (message.content) {
    parts.push({ type: "text", content: message.content });
  }

  // Safety refusal
  if (message.refusal) {
    parts.push({ type: "refusal", content: message.refusal });
  }

  // Tool calls
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      if (tc.type === "function" && tc.function) {
        parts.push({
          type: "tool_call",
          id: tc.id,
          name: tc.function.name,
          arguments: safeJsonParse(tc.function.arguments),
        });
      } else if (tc.type === "custom" && tc.custom) {
        parts.push({
          type: "tool_call",
          id: tc.id,
          name: tc.custom.name,
          arguments: tc.custom.input,
        });
      }
    }
  }

  // Deprecated function_call
  if (message.function_call) {
    parts.push({
      type: "tool_call",
      name: message.function_call.name,
      arguments: safeJsonParse(message.function_call.arguments),
    });
  }

  // Audio response
  if (message.audio?.data) {
    parts.push({
      type: "blob",
      modality: "audio",
      mime_type: "audio/mp3",
      content: message.audio.data,
    });
  }

  return [
    {
      role: "assistant",
      finish_reason:
        finishReasonMap[choice.finish_reason] ?? choice.finish_reason ?? "stop",
      parts,
    },
  ];
}

/**
 * Assembles an OTel output message from an OpenAI text completion response.
 *
 * @param choice - A single Completion.Choice (has .text and .finish_reason)
 * @param finishReasonMap - Mapping of OpenAI finish reasons to OTel standard values
 * @returns Array with a single OTelOutputMessage
 */
export function buildOpenAICompletionOutputMessage(
  choice: any,
  finishReasonMap: Record<string, string>,
): OTelOutputMessage[] {
  const outputMsg: OTelOutputMessage = {
    role: "assistant",
    finish_reason:
      finishReasonMap[choice.finish_reason] ?? choice.finish_reason ?? "stop",
    parts: [{ type: "text", content: choice.text ?? "" }],
  };
  return [outputMsg];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Safely parse a JSON string, returning the original string if parsing fails.
 * OpenAI tool call arguments are JSON strings that should be parsed to objects.
 */
function safeJsonParse(value: string | undefined): any {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
