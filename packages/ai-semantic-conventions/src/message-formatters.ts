/**
 * Utility functions for formatting LLM messages according to OpenTelemetry
 * Semantic Conventions v1.40.0 for gen_ai attributes.
 *
 * These formatters produce JSON strings for attributes like:
 * - gen_ai.system_instructions
 * - gen_ai.input.messages
 * - gen_ai.output.messages
 */

import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from "@opentelemetry/semantic-conventions/incubating";

/**
 * Formats system instructions for gen_ai.system_instructions attribute.
 *
 * @param system - System instruction as string or structured object
 * @returns JSON string array with a single text instruction object
 */
export function formatSystemInstructions(
  system: string | Array<{ type: string; text?: string; [key: string]: any }>
): string {
  return JSON.stringify([
    {
      type: "text",
      content: typeof system === "string" ? system : JSON.stringify(system),
    },
  ]);
}

/**
 * Formats chat messages for gen_ai.input.messages attribute.
 *
 * @param messages - Array of message objects with role and content
 * @returns JSON string array of messages with role and parts
 */
export function formatInputMessages(
  messages: Array<{
    role: string;
    content: string | Array<any>;
  }>
): string {
  return JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      parts:
        typeof message.content === "string"
          ? [{ type: "text", content: message.content }]
          : message.content.map((block) => ({
              type: "text",
              content: JSON.stringify(block),
            })),
    }))
  );
}

/**
 * Formats a text completion prompt for gen_ai.input.messages attribute.
 *
 * @param prompt - The text prompt string
 * @returns JSON string array with a single user message
 */
export function formatInputMessagesFromPrompt(prompt: string): string {
  return JSON.stringify([
    { role: "user", parts: [{ type: "text", content: prompt }] },
  ]);
}

/**
 * Formats output content for gen_ai.output.messages attribute.
 *
 * @param content - Array of content blocks or string completion
 * @param stopReason - The stop reason from the LLM response
 * @param finishReasonMap - Mapping of provider-specific stop reasons to standard finish reasons
 * @param type - Type of completion: "chat" or "text_completion" (use GEN_AI_OPERATION_NAME_VALUE_* constants)
 * @returns JSON string array with a single assistant message
 */
export function formatOutputMessage(
  content: Array<any> | string,
  stopReason: string | null,
  finishReasonMap: Record<string, string>,
  type: string
): string {
  const outputMessage: Record<string, unknown> = {
    role: "assistant",
    finish_reason: stopReason
      ? (finishReasonMap[stopReason] ?? stopReason)
      : null,
    parts: [],
  };

  if (type === GEN_AI_OPERATION_NAME_VALUE_CHAT && Array.isArray(content)) {
    outputMessage.parts = content.map((block) => {
      if (typeof block === "string") {
        return { type: "text", content: block };
      }
      if (block.type === "text") {
        return { type: "text", content: block.text };
      }
      if (block.type === "thinking") {
        return { type: "thinking", content: block.thinking };
      }
      return { type: block.type, content: JSON.stringify(block) };
    });
  } else if (type === GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION && typeof content === "string") {
    outputMessage.parts = [{ type: "text", content }];
  }

  return JSON.stringify([outputMessage]);
}
