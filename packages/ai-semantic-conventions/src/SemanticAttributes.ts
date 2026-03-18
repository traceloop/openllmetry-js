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

import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from "@opentelemetry/semantic-conventions/incubating";

export const SpanAttributes = {
  // Attributes not yet in @opentelemetry/semantic-conventions

  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS: "gen_ai.usage.cache_creation_input_tokens",
  // Replaced with: OTel ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS - "gen_ai.usage.cache_creation.input_tokens"
  // Kept for backwards compatibility
  
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS: "gen_ai.usage.cache_read_input_tokens",
  // Replaced with: OTel ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS - "gen_ai.usage.cache_read.input_tokens"
  // Kept for backwards compatibility
  
  GEN_AI_USAGE_REASONING_TOKENS: "gen_ai.usage.reasoning_tokens", // No OTel equivalent yet - keep as custom

  GEN_AI_REQUEST_THINKING_TYPE: "gen_ai.request.thinking_type", // No OTel equivalent yet - keep as custom
  
  GEN_AI_REQUEST_THINKING_BUDGET_TOKENS: "gen_ai.request.thinking.budget_tokens", // No OTel equivalent yet - keep as custom
  // LLM

  LLM_REQUEST_TYPE: "llm.request.type",
  // Replaced with: OTel ATTR_GEN_AI_OPERATION_NAME - "gen_ai.operation.name"
  // Kept for backwards compatibility
  
  GEN_AI_USAGE_TOTAL_TOKENS: "gen_ai.usage.total_tokens", // No direct OTel equivalent - compute as ATTR_GEN_AI_USAGE_INPUT_TOKENS + ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
  LLM_USAGE_TOTAL_TOKENS: "llm.usage.total_tokens", // No direct OTel equivalent - could compute as ATTR_GEN_AI_USAGE_INPUT_TOKENS + ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
  // Kept for backwards compatibility
  
  LLM_TOP_K: "llm.top_k",
  // Replaced with: OTel ATTR_GEN_AI_REQUEST_TOP_K - "gen_ai.request.top_k"
  // Kept for backwards compatibility
  
  LLM_FREQUENCY_PENALTY: "llm.frequency_penalty",
  // Replaced with: OTel ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY - "gen_ai.request.frequency_penalty"
  // Kept for backwards compatibility
  
  LLM_PRESENCE_PENALTY: "llm.presence_penalty",
  // Replaced with: OTel ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY - "gen_ai.request.presence_penalty"
  // Kept for backwards compatibility
  
  LLM_CHAT_STOP_SEQUENCES: "llm.chat.stop_sequences",
  // Replaced with: OTel ATTR_GEN_AI_REQUEST_STOP_SEQUENCES - "gen_ai.request.stop_sequences"
  // Kept for backwards compatibility
  
  LLM_REQUEST_FUNCTIONS: "llm.request.functions",
  // Replaced with: OTel ATTR_GEN_AI_TOOL_DEFINITIONS - "gen_ai.tool.definitions"
  // Note: ATTR_GEN_AI_TOOL_DEFINITIONS expects a structured array of objects, not a plain string/array
  // Kept for backwards compatibility
  
  // Vector DB
  VECTOR_DB_VENDOR: "db.system", // Already aligned with OTel - ATTR_DB_SYSTEM - "db.system"
  VECTOR_DB_QUERY_TOP_K: "db.vector.query.top_k", // No OTel equivalent yet - keep as custom
  VECTOR_DB_TABLE_NAME: "db.vector.table_name", // No OTel equivalent yet - keep as custom
  VECTOR_DB_ADD_COUNT: "db.vector.add.count", // No OTel equivalent yet - keep as custom
  VECTOR_DB_DELETE_SELECTOR: "db.vector.delete.selector", // No OTel equivalent yet - keep as custom
  VECTOR_DB_DELETE_COUNT: "db.vector.delete.count", // No OTel equivalent yet - keep as custom
  VECTOR_DB_GET_SELECTOR: "db.vector.get.selector", // No OTel equivalent yet - keep as custom
  VECTOR_DB_GET_COUNT: "db.vector.get.count", // No OTel equivalent yet - keep as custom
  VECTOR_DB_GET_INCLUDE_METADATA: "db.vector.get.include_metadata", // No OTel equivalent yet - keep as custom
  VECTOR_DB_GET_INCLUDE_VALUES: "db.vector.get.include_values", // No OTel equivalent yet - keep as custom

  // LLM Workflows (all Traceloop-specific, no OTel equivalents yet)
  TRACELOOP_SPAN_KIND: "traceloop.span.kind",
  TRACELOOP_WORKFLOW_NAME: "traceloop.workflow.name",
  TRACELOOP_ENTITY_NAME: "traceloop.entity.name",
  TRACELOOP_ENTITY_PATH: "traceloop.entity.path",
  TRACELOOP_ENTITY_VERSION: "traceloop.entity.version",
  TRACELOOP_ASSOCIATION_PROPERTIES: "traceloop.association.properties",
  TRACELOOP_ENTITY_INPUT: "traceloop.entity.input",
  TRACELOOP_ENTITY_OUTPUT: "traceloop.entity.output",

  // MCP (Model Context Protocol)
  MCP_RESPONSE_VALUE: "mcp.response.value", // No OTel equivalent yet - keep as custom
  MCP_REQUEST_ID: "mcp.request.id", // No OTel equivalent yet - keep as custom (OTel has ATTR_MCP_SESSION_ID / ATTR_MCP_METHOD_NAME instead)
};

export const Events = {
  DB_QUERY_EMBEDDINGS: "db.query.embeddings",
  DB_QUERY_RESULT: "db.query.result",
};

export const EventAttributes = {
  // Query Embeddings
  DB_QUERY_EMBEDDINGS_VECTOR: "db.query.embeddings.vector",

  // Query Result (canonical format)
  DB_QUERY_RESULT_ID: "db.query.result.id",
  DB_QUERY_RESULT_SCORE: "db.query.result.score",
  DB_QUERY_RESULT_DISTANCE: "db.query.result.distance",
  DB_QUERY_RESULT_METADATA: "db.query.result.metadata",
  DB_QUERY_RESULT_VECTOR: "db.query.result.vector",
  DB_QUERY_RESULT_DOCUMENT: "db.query.result.document",

  // DEPRECATED: Vector DB Query Request
  VECTOR_DB_QUERY_TOP_K: "db.vector.query.top_k",
  VECTOR_DB_QUERY_INCLUDE_VALUES: "db.vector.query.include_values",
  VECTOR_DB_QUERY_INCLUDE_METADATA: "db.vector.query.include_metadata",
  VECTOR_DB_QUERY_ID: "db.vector.query.id",
  VECTOR_DB_QUERY_EMBEDDINGS_VECTOR: "db.vector.query.embeddings.vector",
  VECTOR_DB_QUERY_METADATA_FILTER: "db.vector.query.metadata_filter",

  // DEPRECATED: Vector DB Query Response
  VECTOR_DB_QUERY_RESULT_NAMESPACE: "db.vector.query.result.namespace",
  VECTOR_DB_QUERY_RESULT_READ_UNITS_CONSUMED: "db.vector.query.result.read_units",
  VECTOR_DB_QUERY_RESULT_MATCHES_LENGTH: "db.vector.query.result.matches_length",

  // DEPRECATED: Vector DB Query Response of each result
  VECTOR_DB_QUERY_RESULT_SCORE: "db.vector.query.result.{i}.score",
  VECTOR_DB_QUERY_RESULT_ID: "db.vector.query.result.{i}.id",
  VECTOR_DB_QUERY_RESULT_VALUES: "db.vector.query.result.{i}.values",
  VECTOR_DB_QUERY_RESULT_SPARSE_INDICES: "db.vector.query.result.{i}.sparse.indices",
  VECTOR_DB_QUERY_RESULT_SPARSE_VALUES: "db.vector.query.result.{i}.sparse.values",
  VECTOR_DB_QUERY_RESULT_METADATA: "db.vector.query.result.{i}.metadata",
};

export enum LLMRequestTypeValues {
  COMPLETION = GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  CHAT = GEN_AI_OPERATION_NAME_VALUE_CHAT,
  RERANK = "rerank",
  UNKNOWN = "unknown",
}

export enum TraceloopSpanKindValues {
  WORKFLOW = "workflow",
  TASK = "task",
  AGENT = "agent",
  TOOL = "tool",
  SESSION = "session",
  UNKNOWN = "unknown",
}

/**
 * Standardized finish reason values following OpenTelemetry semantic conventions.
 * These should be used by all LLM provider instrumentations when mapping
 * provider-specific stop reasons to standard values.
 */
export const FinishReasons = {
  STOP: "stop",
  LENGTH: "length",
  TOOL_CALL: "tool_call",
  CONTENT_FILTER: "content_filter",
  ERROR: "error",
} as const;
