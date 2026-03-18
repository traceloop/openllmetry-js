/**
 * Provider-specific content block mappers for OTel gen_ai attributes.
 *
 * Each function maps a single provider SDK content block to its
 * OTel-compliant part object, as defined in the gen_ai semantic conventions.
 *
 * These are passed as the `contentBlockMapper` parameter to
 * `formatInputMessages` and `formatOutputMessage`.
 */

// =============================================================================
// Anthropic
// =============================================================================

/**
 * Maps a single Anthropic SDK content block to its OTel-compliant part object.
 *
 * Supported block types:
 * - text       → TextPart        { type: "text", content }
 * - image      → BlobPart        { type: "blob", modality: "image", ... }
 *              → UriPart         { type: "uri",  modality: "image", uri }
 * - tool_use   → ToolCallRequestPart  { type: "tool_call", id, name, arguments }
 * - tool_result→ ToolCallResponsePart { type: "tool_call_response", id, response }
 * - document   → FilePart        { type: "file", modality: "text", mime_type, file_id }
 * - thinking   → ReasoningPart   { type: "reasoning", content }
 * - (other)    → GenericPart     { type, ...block }
 */
export function mapAnthropicContentBlock(block: any): object {
  if (typeof block === "string") {
    return { type: "text", content: block };
  }
  switch (block.type) {
    case "text":
      return { type: "text", content: block.text };

    case "image":
      if (block.source?.type === "base64") {
        return {
          type: "blob",
          modality: "image",
          mime_type: block.source.media_type,
          content: block.source.data,
        };
      }
      if (block.source?.type === "url") {
        return { type: "uri", modality: "image", uri: block.source.url };
      }
      return { type: "blob", modality: "image", ...block.source };

    case "tool_use":
      return { type: "tool_call", id: block.id, name: block.name, arguments: block.input };

    case "tool_result":
      return { type: "tool_call_response", id: block.tool_use_id, response: block.content };

    case "document":
      return {
        type: "file",
        modality: "text",
        mime_type: "application/pdf",
        file_id: block.source?.id ?? block.source?.url,
      };

    case "thinking":
      return { type: "reasoning", content: block.thinking };

    default:
      return { type: block.type, ...block };
  }
}
