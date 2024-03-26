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
  LLM_TOP_K: "llm.top_k",
  LLM_FREQUENCY_PENALTY: "llm.frequency_penalty",
  LLM_PRESENCE_PENALTY: "llm.presence_penalty",
  LLM_PROMPTS: "llm.prompts",
  LLM_COMPLETIONS: "llm.completions",
  LLM_CHAT_STOP_SEQUENCES: "llm.chat.stop_sequences",

  // Vector DB
  VECTOR_DB_VENDOR: "db.system",
  VECTOR_DB_QUERY_TOP_K: "db.vector.query.top_k",

  // LLM Workflows
  TRACELOOP_SPAN_KIND: "traceloop.span.kind",
  TRACELOOP_WORKFLOW_NAME: "traceloop.workflow.name",
  TRACELOOP_ENTITY_NAME: "traceloop.entity.name",
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
