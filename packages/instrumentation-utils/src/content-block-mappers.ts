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
//  Maps a single Anthropic SDK content block to its OTel-compliant part object.
//
//   text                      → TextPart
//   image (base64)            → BlobPart       { modality: "image", mime_type from block }
//   image (url)               → UriPart        { modality: "image" }
//   document (base64)         → BlobPart       { mime_type from block — may be "application/pdf" or "text/plain" }
//   document (text)           → TextPart
//   document (url)            → UriPart        { mime_type: "application/pdf" }
//   document (file)           → FilePart       { file_id from source.file_id }
//   tool_use                  → ToolCallRequestPart
//   tool_result               → ToolCallResponsePart  (response may be string or content block array)
//   server_tool_use           → ServerToolCallPart
//   thinking                  → ReasoningPart  (OTel type is "reasoning", not "thinking")
//   redacted_thinking         → GenericPart    { type: "redacted_thinking" }  — data intentionally omitted
//   <unknown>                 → GenericPart

/**
 * Maps a single Anthropic content block to its OTel-compliant part object.
 * Used by formatInputMessages, formatOutputMessage, and formatSystemInstructions.
 */
export function mapAnthropicContentBlock(block: any): object {
  if (typeof block === "string") {
    return { type: "text", content: block };
  }

  switch (block.type) {

    // -------------------------------------------------------------------------
    // Text
    // -------------------------------------------------------------------------
    case "text":
      return { type: "text", content: block.text };

    // -------------------------------------------------------------------------
    // Image — sources: base64 | url
    // -------------------------------------------------------------------------
    case "image": {
      const src = block.source;
      if (src?.type === "base64") {
        return {
          type: "blob",
          modality: "image",
          mime_type: src.media_type,  // e.g. "image/jpeg", "image/png", "image/webp", "image/gif"
          content: src.data,
        };
      }
      if (src?.type === "url") {
        return { type: "uri", modality: "image", uri: src.url };
      }
      // Unknown image source shape — fall through to GenericPart
      return { type: block.type, ...block };
    }

    // -------------------------------------------------------------------------
    // Document — sources: base64 | text | url | file
    // Note: document blocks have no OTel modality (modality is image/video/audio only)
    // -------------------------------------------------------------------------
    case "document": {
      const src = block.source;
      switch (src?.type) {
        case "base64":
          // Inline base64 — media_type comes from the block itself, never hardcode it
          // (can be "application/pdf" or "text/plain")
          return {
            type: "blob",
            mime_type: src.media_type,
            content: src.data,
          };
        case "text":
          // Inline plain text document
          return { type: "text", content: src.data };
        case "url":
          // URL-referenced PDF
          return { type: "uri", mime_type: "application/pdf", uri: src.url };
        case "file":
          // Files API reference — file_id is on source.file_id
          return { type: "file", file_id: src.file_id };
        default:
          return { type: block.type, ...block };
      }
    }

    // -------------------------------------------------------------------------
    // Tool use (client-side function call requested by the model)
    // -------------------------------------------------------------------------
    case "tool_use":
      return {
        type: "tool_call",
        id: block.id,
        name: block.name,
        arguments: block.input,
      };

    // -------------------------------------------------------------------------
    // Tool result (client sends function result back to the model)
    // Note: block.content may be a string OR an array of content blocks
    // -------------------------------------------------------------------------
    case "tool_result":
      return {
        type: "tool_call_response",
        id: block.tool_use_id,
        response: block.content,
      };

    // -------------------------------------------------------------------------
    // Server-side tool use (e.g. web_search, code_execution — run by Anthropic)
    // -------------------------------------------------------------------------
    case "server_tool_use":
      return {
        type: "server_tool_call",
        id: block.id,
        name: block.name,
        server_tool_call: { type: block.name, ...block.input },
      };

    // -------------------------------------------------------------------------
    // Extended thinking / reasoning
    // -------------------------------------------------------------------------
    case "thinking":
      // OTel ReasoningPart uses type "reasoning", not "thinking"
      return { type: "reasoning", content: block.thinking };

    case "redacted_thinking":
      // Anthropic redacts thinking blocks when they contain sensitive content.
      // The `data` field is an opaque encrypted blob — intentionally not logged.
      return { type: "redacted_thinking" };

    // -------------------------------------------------------------------------
    // Unknown / future block types — preserve as GenericPart
    // -------------------------------------------------------------------------
    default:
      return { type: block.type, ...block };
  }
}
