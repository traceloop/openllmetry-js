/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type * as genai from "@google/genai";

//  Maps a single @google/genai Part to its OTel-compliant part object.
//
//   text (thought: true)    → ReasoningPart { type: "reasoning", content }
//   text                    → TextPart
//   inlineData (base64)     → BlobPart   { modality derived from mimeType, mime_type, content }
//   fileData (URI)          → UriPart    { modality derived from mimeType, mime_type, uri }
//   functionCall            → ToolCallRequestPart
//   functionResponse        → ToolCallResponsePart
//   executableCode          → GenericPart { type: "executable_code", language, content }
//   codeExecutionResult     → GenericPart { type: "code_execution_result", outcome, content }
//   <unknown>               → GenericPart

/** OTel gen_ai part type strings used by the GenAI mapper. */
export const GenAIOtelPartType = {
  TEXT: "text",
  REASONING: "reasoning",
  BLOB: "blob",
  URI: "uri",
  TOOL_CALL: "tool_call",
  TOOL_CALL_RESPONSE: "tool_call_response",
  EXECUTABLE_CODE: "executable_code",
  CODE_EXECUTION_RESULT: "code_execution_result",
  UNKNOWN: "unknown",
} as const;

function genaiModalityFromMimeType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export function mapGenAIContentBlock(block: genai.Part | string): object {
  if (typeof block === "string") {
    return { type: GenAIOtelPartType.TEXT, content: block };
  }

  // thought: true marks a model reasoning/thinking block (Gemini thinking models).
  // text may be undefined on malformed parts — fall back to empty string.
  if (block.thought === true) {
    return { type: GenAIOtelPartType.REASONING, content: block.text ?? "" };
  }

  if (block.text !== undefined) {
    return { type: GenAIOtelPartType.TEXT, content: block.text };
  }

  if (block.inlineData) {
    const mimeType = block.inlineData.mimeType;
    return {
      type: GenAIOtelPartType.BLOB,
      modality: genaiModalityFromMimeType(mimeType ?? ""),
      ...(mimeType ? { mime_type: mimeType } : {}),
      content: block.inlineData.data,
    };
  }

  if (block.fileData) {
    const mimeType = block.fileData.mimeType;
    return {
      type: GenAIOtelPartType.URI,
      modality: genaiModalityFromMimeType(mimeType ?? ""),
      ...(mimeType ? { mime_type: mimeType } : {}),
      uri: block.fileData.fileUri,
    };
  }

  if (block.functionCall) {
    return {
      type: GenAIOtelPartType.TOOL_CALL,
      id: block.functionCall.id ?? null,
      name: block.functionCall.name,
      arguments: block.functionCall.args,
    };
  }

  if (block.functionResponse) {
    const resp = block.functionResponse.response;
    return {
      type: GenAIOtelPartType.TOOL_CALL_RESPONSE,
      id: block.functionResponse.id ?? null,
      // Serialize objects to JSON string so the dashboard can display them.
      // Normalize undefined (missing response) to null so the field is always present.
      response:
        resp === undefined
          ? null
          : resp !== null && typeof resp === "object"
            ? JSON.stringify(resp)
            : resp,
    };
  }

  if (block.executableCode) {
    return {
      type: GenAIOtelPartType.EXECUTABLE_CODE,
      language: block.executableCode.language,
      content: block.executableCode.code,
    };
  }

  if (block.codeExecutionResult) {
    return {
      type: GenAIOtelPartType.CODE_EXECUTION_RESULT,
      outcome: block.codeExecutionResult.outcome,
      content: block.codeExecutionResult.output,
    };
  }

  // Do not spread the block — it may contain circular references or sensitive data.
  return { type: GenAIOtelPartType.UNKNOWN };
}
