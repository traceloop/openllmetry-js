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
          mime_type: src.media_type, // e.g. "image/jpeg", "image/png", "image/webp", "image/gif"
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

// =============================================================================
// OpenAI
// =============================================================================
//  Maps a single OpenAI SDK input content part to its OTel-compliant part object.
//
//  This mapper handles the REQUEST-side content parts that appear in user messages
//  (ChatCompletionContentPart union). OpenAI's response is flat (not block-based),
//  so output mapping is handled by buildOpenAIOutputMessage in message-helpers.ts.
//
//   text                      → TextPart
//   image_url (regular URL)   → UriPart        { modality: "image" }
//   image_url (data: URI)     → BlobPart       { modality: "image", mime_type parsed from URI }
//   input_audio               → BlobPart       { modality: "audio", mime_type: "audio/{format}" }
//   file (file_id)            → FilePart       { file_id }
//   file (file_data)          → BlobPart       { no modality — documents }
//   refusal                   → GenericPart    { type: "refusal", content }
//   <unknown>                 → GenericPart

/**
 * Maps a single OpenAI SDK content part to its OTel-compliant part object.
 * Used for input content parts in user messages.
 */
export function mapOpenAIContentBlock(block: any): object {
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
    // Image URL — can be a regular URL or a base64 data: URI
    // -------------------------------------------------------------------------
    case "image_url": {
      const url = block.image_url?.url;
      if (url && url.startsWith("data:")) {
        // Parse data URI: data:image/png;base64,xxxx
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            type: "blob",
            modality: "image",
            mime_type: match[1],
            content: match[2],
          };
        }
      }
      return { type: "uri", modality: "image", uri: url };
    }

    // -------------------------------------------------------------------------
    // Input audio — base64 encoded audio data with format
    // -------------------------------------------------------------------------
    case "input_audio":
      return {
        type: "blob",
        modality: "audio",
        mime_type: `audio/${block.input_audio?.format || "wav"}`,
        content: block.input_audio?.data,
      };

    // -------------------------------------------------------------------------
    // File — can be file_id reference or inline file_data
    // OTel FilePart and BlobPart require `modality` (image/video/audio),
    // but OpenAI files don't specify modality. Use GenericPart to preserve
    // all info without violating the schema.
    // -------------------------------------------------------------------------
    case "file": {
      if (block.file?.file_id) {
        return {
          type: "file",
          file_id: block.file.file_id,
          ...(block.file.filename && { filename: block.file.filename }),
        };
      }
      if (block.file?.file_data) {
        // Inline file data → BlobPart. OTel FilePart is a reference type (file_id only).
        return {
          type: "blob",
          mime_type: block.file.mime_type || "application/octet-stream",
          content: block.file.file_data,
        };
      }
      return { type: block.type, ...block };
    }

    // -------------------------------------------------------------------------
    // Refusal — assistant content part indicating safety refusal
    // -------------------------------------------------------------------------
    case "refusal":
      return { type: "refusal", content: block.refusal };

    // -------------------------------------------------------------------------
    // Unknown / future content part types — preserve as GenericPart
    // -------------------------------------------------------------------------
    default:
      return { type: block.type, ...block };
  }
}

// =============================================================================
// Bedrock
// =============================================================================
//  Maps a single Bedrock SDK content block to its OTel-compliant part object.
//
//  Bedrock is used by multiple providers (Anthropic, AI21, Amazon Nova, Meta,
//  Cohere) — all share the same block schema on the Bedrock layer:
//
//   plain string              → TextPart
//   { type: "text", text }    → TextPart
//   { text } (Nova format)    → TextPart
//   tool_use                  → ToolCallRequestPart
//   tool_result               → ToolCallResponsePart
//   <unknown>                 → GenericPart

/**
 * Maps a single Bedrock content block to its OTel-compliant part object.
 * Used by formatInputMessages and formatOutputMessage for all Bedrock providers.
 */
export const mapBedrockContentBlock = (block: any): object => {
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
    // Tool use (model requests a function call)
    // -------------------------------------------------------------------------
    case "tool_use":
      return {
        type: "tool_call",
        id: block.id,
        name: block.name,
        arguments: block.input,
      };

    // -------------------------------------------------------------------------
    // Tool result (client returns function result to model)
    // -------------------------------------------------------------------------
    case "tool_result":
      return {
        type: "tool_call_response",
        id: block.tool_use_id,
        response: block.content,
      };

    // -------------------------------------------------------------------------
    // Amazon Nova format: { text: "..." } without explicit type
    // -------------------------------------------------------------------------
    default:
      if (!block.type && block.text !== undefined) {
        return { type: "text", content: block.text };
      }
      return { type: block.type, ...block };
  }
};
