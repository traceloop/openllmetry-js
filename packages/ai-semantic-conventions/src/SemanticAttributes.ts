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

export const SpanAttributes = {
  LLM_VENDOR: "llm.vendor",
  LLM_REQUEST_TYPE: "llm.request.type",
  LLM_REQUEST_MODEL: "llm.request.model",
  LLM_RESPONSE_MODEL: "llm.response.model",
  LLM_REQUEST_MAX_TOKENS: "llm.request.max_tokens",
  LLM_USAGE_TOTAL_TOKENS: "llm.usage.total_tokens",
  LLM_USAGE_COMPLETION_TOKENS: "llm.usage.completion_tokens",
  LLM_USAGE_PROMPT_TOKENS: "llm.usage.prompt_tokens",
  LLM_TEMPERATURE: "llm.temperature",
  LLM_TOP_P: "llm.top_p",
  LLM_FREQUENCY_PENALTY: "llm.frequency_penalty",
  LLM_PRESENCE_PENALTY: "llm.presence_penalty",
  LLM_PROMPTS: "llm.prompts",
  LLM_COMPLETIONS: "llm.completions",
  LLM_CHAT_STOP_SEQUENCES: "llm.chat.stop_sequences",

  // Vector DB
  VECTOR_DB_VENDOR: "vector_db.vendor",
  VECTOR_DB_QUERY_TOP_K: "vector_db.query.top_k",

  // LLM Workflows
  TRACELOOP_SPAN_KIND: "traceloop.span.kind",
  TRACELOOP_WORKFLOW_NAME: "traceloop.workflow.name",
  TRACELOOP_ENTITY_NAME: "traceloop.entity.name",
  TRACELOOP_ASSOCIATION_PROPERTIES: "traceloop.association.properties",
};

export enum LLMRequestTypeValues {
  COMPLETION = "completion",
  CHAT = "chat",
  RERANK = "rerank",
  UNKNOWN = "unknown",
}

export enum TraceloopSpanKindValues {
  WORKFLOW = "workflow",
  TASK = "task",
  AGENT = "agent",
  TOOL = "tool",
  UNKNOWN = "unknown",
}
