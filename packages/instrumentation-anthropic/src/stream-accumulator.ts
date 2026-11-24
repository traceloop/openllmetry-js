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
import type {
  ContentBlock,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

export type PartialJsonBuffers = Map<number, string>;

export function flushPartialJson(
  content: ContentBlock[],
  buffers: PartialJsonBuffers,
): void {
  for (const [i, json] of buffers) {
    const block = content[i];
    if (json === "" || !block || !("input" in block)) {
      continue;
    }
    try {
      block.input = JSON.parse(json);
    } catch {
      continue;
    }
  }
}

export function accumulateContentBlockEvent(
  content: ContentBlock[],
  chunk: MessageStreamEvent,
  buffers: PartialJsonBuffers,
): void {
  switch (chunk.type) {
    case "content_block_start":
      if (content.length <= chunk.index) {
        content.push({ ...chunk.content_block });
      }
      break;

    case "content_block_delta":
      if (chunk.index < content.length) {
        const current = content[chunk.index];
        if (current.type === "text" && chunk.delta.type === "text_delta") {
          content[chunk.index] = {
            type: "text",
            text: current.text + chunk.delta.text,
            citations: current.citations,
          };
        } else if (
          current.type === "thinking" &&
          chunk.delta.type === "thinking_delta"
        ) {
          content[chunk.index] = {
            ...current,
            thinking: current.thinking + chunk.delta.thinking,
          };
        } else if (chunk.delta.type === "input_json_delta") {
          buffers.set(
            chunk.index,
            (buffers.get(chunk.index) ?? "") + chunk.delta.partial_json,
          );
        }
      }
      break;
  }
}
