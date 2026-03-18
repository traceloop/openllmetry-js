/**
 * Utility functions for formatting LLM messages according to OpenTelemetry
 * Semantic Conventions v1.40.0 for gen_ai attributes.
 *
 * These formatters produce JSON strings for attributes like:
 * - gen_ai.system_instructions
 * - gen_ai.input.messages
 * - gen_ai.output.messages
 *
 * JSON schemas sourced from:
 * - https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-system-instructions.json
 * - https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-input-messages.json
 * - https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-output-messages.json
 */

import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from "@opentelemetry/semantic-conventions/incubating";

// =============================================================================
// OTel Part Types (shared across all three schemas)
// =============================================================================
//
// TextPart:              { type: "text",                  content: string }
// ToolCallRequestPart:   { type: "tool_call",             id?, name, arguments? }
// ToolCallResponsePart:  { type: "tool_call_response",    id?, response }
// ServerToolCallPart:    { type: "server_tool_call",      id?, name, server_tool_call }
// ServerToolCallRespPart:{ type: "server_tool_call_response", id?, server_tool_call_response }
// BlobPart:              { type: "blob",                  modality, mime_type?, content (base64) }
// UriPart:               { type: "uri",                   modality, mime_type?, uri }
// FilePart:              { type: "file",                  modality, mime_type?, file_id }
// ReasoningPart:         { type: "reasoning",             content: string }
// GenericPart:           { type: string, ...any }          — extensibility escape hatch
//
// Modality enum: "image" | "video" | "audio"
// Role enum:     "system" | "user" | "assistant" | "tool"

// =============================================================================
// formatSystemInstructions
// =============================================================================
//
// OTel contract — gen_ai.system_instructions (array of parts, NO wrapping message):
//
// [
//   TextPart            | { type: "text",               content: string }
//   ToolCallRequestPart | { type: "tool_call",          id?, name, arguments? }
//   ToolCallResponsePart| { type: "tool_call_response", id?, response }
//   BlobPart            | { type: "blob",               modality, mime_type?, content }
//   FilePart            | { type: "file",               modality, mime_type?, file_id }
//   UriPart             | { type: "uri",                modality, mime_type?, uri }
//   ReasoningPart       | { type: "reasoning",          content: string }
//   GenericPart         | { type: string, ...any }
// ]
//
// Example (string input):
//   [ { "type": "text", "content": "You are a helpful assistant." } ]
//
// Example (array input with mixed blocks):
//   [
//     { "type": "text",  "content": "You are a helpful assistant." },
//     { "type": "text",  "content": "Always respond in English." }
//   ]

/**
 * Formats system instructions for gen_ai.system_instructions attribute.
 *
 * @param system - System instruction as a plain string or an array of content blocks
 * @returns JSON string — a flat array of OTel part objects (no wrapping message)
 */
export function formatSystemInstructions(
  system: string | Array<{ type: string; text?: string; [key: string]: any }>
): string {
  if (typeof system === "string") {
    return JSON.stringify([{ type: "text", content: system }]);
  }

  // Each block in the array maps directly to its OTel part — no wrapper object
  return JSON.stringify(
    system.map((block) => {
      if (block.type === "text") {
        return { type: "text", content: block.text };
      }
      // Preserve any other block type as a GenericPart
      return { ...block };
    })
  );
}

// =============================================================================
// formatInputMessages
// =============================================================================
//
// OTel contract — gen_ai.input.messages (array of ChatMessage objects):
//
// [
//   {
//     role: "system" | "user" | "assistant" | "tool" | string,
//     parts: [
//       TextPart            | { type: "text",                        content: string }
//       ToolCallRequestPart | { type: "tool_call",                   id?, name, arguments? }
//       ToolCallResponsePart| { type: "tool_call_response",          id?, response }
//       ServerToolCallPart  | { type: "server_tool_call",            id?, name, server_tool_call }
//       ServerToolCallResp  | { type: "server_tool_call_response",   id?, server_tool_call_response }
//       BlobPart            | { type: "blob",                        modality, mime_type?, content }
//       FilePart            | { type: "file",                        modality, mime_type?, file_id }
//       UriPart             | { type: "uri",                         modality, mime_type?, uri }
//       ReasoningPart       | { type: "reasoning",                   content: string }
//       GenericPart         | { type: string, ...any }
//     ],
//     name?: string
//   }
// ]
//
// Example (text only):
//   [
//     { "role": "user", "parts": [ { "type": "text", "content": "Hello!" } ] }
//   ]
//
// Example (multimodal with image):
//   [
//     {
//       "role": "user",
//       "parts": [
//         { "type": "text",  "content": "What is in this image?" },
//         { "type": "blob",  "modality": "image", "mime_type": "image/png", "content": "<base64>" }
//       ]
//     }
//   ]
//
// Example (with tool call):
//   [
//     {
//       "role": "assistant",
//       "parts": [ { "type": "tool_call", "id": "call_123", "name": "get_weather", "arguments": { "city": "Paris" } } ]
//     },
//     {
//       "role": "tool",
//       "parts": [ { "type": "tool_call_response", "id": "call_123", "response": "rainy, 57°F" } ]
//     }
//   ]

/**
 * Formats chat messages for gen_ai.input.messages attribute.
 *
 * @param messages - Array of message objects with role and content
 * @param contentBlockMapper - Provider-specific function to map a content block to an OTel part
 * @returns JSON string — array of ChatMessage objects with role and typed parts
 */
export function formatInputMessages(
  messages: Array<{
    role: string;
    content: string | Array<any>;
  }>,
  contentBlockMapper: (block: any) => object
): string {
  return JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      parts:
        typeof message.content === "string"
          ? [{ type: "text", content: message.content }]
          : message.content.map(contentBlockMapper),
    }))
  );
}

// =============================================================================
// formatInputMessagesFromPrompt
// =============================================================================
//
// OTel contract — same as gen_ai.input.messages above.
// Convenience wrapper for a plain text_completion prompt with a single user turn.
//
// Example output:
//   [ { "role": "user", "parts": [ { "type": "text", "content": "Summarise this document." } ] } ]

/**
 * Formats a text completion prompt for gen_ai.input.messages attribute.
 *
 * @param prompt - The text prompt string
 * @returns JSON string — array with a single user ChatMessage
 */
export function formatInputMessagesFromPrompt(prompt: string): string {
  return JSON.stringify([
    { role: "user", parts: [{ type: "text", content: prompt }] },
  ]);
}

// =============================================================================
// formatOutputMessage
// =============================================================================
//
// OTel contract — gen_ai.output.messages (array of OutputMessage objects):
//
// [
//   {
//     role: "assistant" | string,
//     finish_reason: string | null,
//     parts: [
//       TextPart            | { type: "text",                        content: string }
//       ToolCallRequestPart | { type: "tool_call",                   id?, name, arguments? }
//       ToolCallResponsePart| { type: "tool_call_response",          id?,response }
//       ServerToolCallPart  | { type: "server_tool_call",            id?, name, server_tool_call }
//       ServerToolCallResp  | { type: "server_tool_call_response",   id?, server_tool_call_response }
//       BlobPart            | { type: "blob",                        modality, mime_type?, content }
//       FilePart            | { type: "file",                        modality, mime_type?, file_id }
//       UriPart             | { type: "uri",                         modality, mime_type?, uri }
//       ReasoningPart       | { type: "reasoning",                   content: string }
//       GenericPart         | { type: string, ...any }
//     ]
//   }
// ]
//
// Example (simple text response):
//   [
//     {
//       "role": "assistant",
//       "finish_reason": "stop",
//       "parts": [ { "type": "text", "content": "The capital of France is Paris." } ]
//     }
//   ]
//
// Example (tool call response):
//   [
//     {
//       "role": "assistant",
//       "finish_reason": "tool_call",
//       "parts": [ { "type": "tool_call", "id": "call_123", "name": "get_weather", "arguments": { "city": "Paris" } } ]
//     }
//   ]
//
// Example (with reasoning/thinking block):
//   [
//     {
//       "role": "assistant",
//       "finish_reason": "stop",
//       "parts": [
//         { "type": "reasoning", "content": "Let me think about this..." },
//         { "type": "text",      "content": "The answer is 42." }
//       ]
//     }
//   ]

/**
 * Formats output content for gen_ai.output.messages attribute.
 *
 * @param content - Array of content blocks or string completion
 * @param stopReason - The stop reason from the LLM response
 * @param finishReasonMap - Mapping of provider-specific stop reasons to standard finish reasons
 * @param type - Type of completion: "chat" or "text_completion" (use GEN_AI_OPERATION_NAME_VALUE_* constants)
 * @param contentBlockMapper - Provider-specific function to map a content block to an OTel part
 * @returns JSON string — array with a single assistant OutputMessage
 */
export function formatOutputMessage(
  content: Array<any> | string,
  stopReason: string | null,
  finishReasonMap: Record<string, string>,
  type: string,
  contentBlockMapper: (block: any) => object
): string {
  const outputMessage: Record<string, unknown> = {
    role: "assistant",
    ...(stopReason && { finish_reason: finishReasonMap[stopReason] ?? stopReason }),
    parts: [],
  };

  if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT && Array.isArray(content)) {
    outputMessage.parts = content.map(contentBlockMapper);
  } else if (
    type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION &&
    typeof content === "string"
  ) {
    outputMessage.parts = [{ type: "text", content }];
  }

  return JSON.stringify([outputMessage]);
}
