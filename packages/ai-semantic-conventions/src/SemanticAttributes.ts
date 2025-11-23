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
  // OpenTelemetry GenAI Semantic Conventions (Current)
  // Required attributes
  GEN_AI_OPERATION_NAME: "gen_ai.operation.name",
  GEN_AI_PROVIDER_NAME: "gen_ai.provider.name",

  // Request attributes
  GEN_AI_REQUEST_MODEL: "gen_ai.request.model",
  GEN_AI_REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  GEN_AI_REQUEST_TOP_P: "gen_ai.request.top_p",
  GEN_AI_REQUEST_TOP_K: "gen_ai.request.top_k",
  GEN_AI_REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  GEN_AI_REQUEST_FREQUENCY_PENALTY: "gen_ai.request.frequency_penalty",
  GEN_AI_REQUEST_PRESENCE_PENALTY: "gen_ai.request.presence_penalty",
  GEN_AI_REQUEST_STOP_SEQUENCES: "gen_ai.request.stop_sequences",

  // Response attributes
  GEN_AI_RESPONSE_ID: "gen_ai.response.id",
  GEN_AI_RESPONSE_MODEL: "gen_ai.response.model",
  GEN_AI_RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",

  // Token usage (Current OTel naming)
  GEN_AI_USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  GEN_AI_USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",

  // Messages
  GEN_AI_INPUT_MESSAGES: "gen_ai.input.messages",
  GEN_AI_OUTPUT_MESSAGES: "gen_ai.output.messages",
  GEN_AI_SYSTEM_INSTRUCTIONS: "gen_ai.system_instructions",

  // Tool definitions
  GEN_AI_TOOL_DEFINITIONS: "gen_ai.tool.definitions",

  // Agent attributes
  GEN_AI_AGENT_NAME: "gen_ai.agent.name",

  // Deprecated attributes (kept for backward compatibility)
  /** @deprecated Use GEN_AI_PROVIDER_NAME instead */
  LLM_SYSTEM: "gen_ai.system",
  /** @deprecated Use GEN_AI_REQUEST_MODEL instead */
  LLM_REQUEST_MODEL: "gen_ai.request.model",
  /** @deprecated Use GEN_AI_REQUEST_MAX_TOKENS instead */
  LLM_REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  /** @deprecated Use GEN_AI_REQUEST_TEMPERATURE instead */
  LLM_REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  /** @deprecated Use GEN_AI_REQUEST_TOP_P instead */
  LLM_REQUEST_TOP_P: "gen_ai.request.top_p",
  /** @deprecated Use GEN_AI_INPUT_MESSAGES and events instead */
  LLM_PROMPTS: "gen_ai.prompt",
  /** @deprecated Use GEN_AI_OUTPUT_MESSAGES and events instead */
  LLM_COMPLETIONS: "gen_ai.completion",
  /** @deprecated Use GEN_AI_INPUT_MESSAGES instead */
  LLM_INPUT_MESSAGES: "gen_ai.input.messages",
  /** @deprecated Use GEN_AI_OUTPUT_MESSAGES instead */
  LLM_OUTPUT_MESSAGES: "gen_ai.output.messages",
  /** @deprecated Use GEN_AI_RESPONSE_MODEL instead */
  LLM_RESPONSE_MODEL: "gen_ai.response.model",
  /** @deprecated Use GEN_AI_USAGE_INPUT_TOKENS instead */
  LLM_USAGE_PROMPT_TOKENS: "gen_ai.usage.prompt_tokens",
  /** @deprecated Use GEN_AI_USAGE_OUTPUT_TOKENS instead */
  LLM_USAGE_COMPLETION_TOKENS: "gen_ai.usage.completion_tokens",

  // LLM (Non-standard attributes)
  LLM_REQUEST_TYPE: "llm.request.type",
  LLM_USAGE_TOTAL_TOKENS: "llm.usage.total_tokens",
  LLM_TOP_K: "llm.top_k",
  LLM_FREQUENCY_PENALTY: "llm.frequency_penalty",
  LLM_PRESENCE_PENALTY: "llm.presence_penalty",
  LLM_CHAT_STOP_SEQUENCES: "llm.chat.stop_sequences",
  LLM_REQUEST_FUNCTIONS: "llm.request.functions",

  // Vector DB
  VECTOR_DB_VENDOR: "db.system",
  VECTOR_DB_QUERY_TOP_K: "db.vector.query.top_k",
  VECTOR_DB_TABLE_NAME: "db.vector.table_name",
  VECTOR_DB_ADD_COUNT: "db.vector.add.count",
  VECTOR_DB_DELETE_SELECTOR: "db.vector.delete.selector",
  VECTOR_DB_DELETE_COUNT: "db.vector.delete.count",
  VECTOR_DB_GET_SELECTOR: "db.vector.get.selector",
  VECTOR_DB_GET_COUNT: "db.vector.get.count",
  VECTOR_DB_GET_INCLUDE_METADATA: "db.vector.get.include_metadata",
  VECTOR_DB_GET_INCLUDE_VALUES: "db.vector.get.include_values",

  // LLM Workflows
  TRACELOOP_SPAN_KIND: "traceloop.span.kind",
  TRACELOOP_WORKFLOW_NAME: "traceloop.workflow.name",
  TRACELOOP_ENTITY_NAME: "traceloop.entity.name",
  TRACELOOP_ENTITY_PATH: "traceloop.entity.path",
  TRACELOOP_ENTITY_VERSION: "traceloop.entity.version",
  TRACELOOP_ASSOCIATION_PROPERTIES: "traceloop.association.properties",
  TRACELOOP_ENTITY_INPUT: "traceloop.entity.input",
  TRACELOOP_ENTITY_OUTPUT: "traceloop.entity.output",
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
  VECTOR_DB_QUERY_RESULT_READ_UNITS_CONSUMED:
    "db.vector.query.result.read_units",
  VECTOR_DB_QUERY_RESULT_MATCHES_LENGTH:
    "db.vector.query.result.matches_length",

  // DEPRECATED: Vector DB Query Response of each result
  VECTOR_DB_QUERY_RESULT_SCORE: "db.vector.query.result.{i}.score",
  VECTOR_DB_QUERY_RESULT_ID: "db.vector.query.result.{i}.id",
  VECTOR_DB_QUERY_RESULT_VALUES: "db.vector.query.result.{i}.values",
  VECTOR_DB_QUERY_RESULT_SPARSE_INDICES:
    "db.vector.query.result.{i}.sparse.indices",
  VECTOR_DB_QUERY_RESULT_SPARSE_VALUES:
    "db.vector.query.result.{i}.sparse.values",
  VECTOR_DB_QUERY_RESULT_METADATA: "db.vector.query.result.{i}.metadata",
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
