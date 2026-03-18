// This paragraph is a helper for migrating to open telemetry semantic conventions version 1.40
// Will be deleted in merge to main
// TODO: Delete before merge to main
// =============================================================================
// @opentelemetry/semantic-conventions — migration reference: v1.38 → v1.40
// All constants are from the /incubating entry-point.
// Import from: @opentelemetry/semantic-conventions/incubating
//
// --- Provider / system rename (deprecated in v1.38) ---
//
// ATTR_GEN_AI_SYSTEM: "gen_ai.system"                                   --->>> ATTR_GEN_AI_PROVIDER_NAME: "gen_ai.provider.name"
//
// GEN_AI_SYSTEM_VALUE_AZ_AI_INFERENCE: "az.ai.inference"                --->>> GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE: "azure.ai.inference"
//
// GEN_AI_SYSTEM_VALUE_AZ_AI_OPENAI: "az.ai.openai"                      --->>> GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI: "azure.ai.openai"
//
// --- Prompt / completion attributes (deprecated in v1.38) ---
//
// ATTR_GEN_AI_PROMPT: "gen_ai.prompt" (user/assistant messages)         --->>> ATTR_GEN_AI_INPUT_MESSAGES: "gen_ai.input.messages" (JSON array)
//
// ATTR_GEN_AI_PROMPT: "gen_ai.prompt" (system instructions)             --->>> ATTR_GEN_AI_SYSTEM_INSTRUCTIONS: "gen_ai.system_instructions" (JSON array)
//
// ATTR_GEN_AI_COMPLETION: "gen_ai.completion"                           --->>> ATTR_GEN_AI_OUTPUT_MESSAGES: "gen_ai.output.messages" (JSON array)
//
// --- Token usage renames (deprecated in v1.38) ---
//
// ATTR_GEN_AI_USAGE_PROMPT_TOKENS: "gen_ai.usage.prompt_tokens"         --->>> ATTR_GEN_AI_USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens"
//
// ATTR_GEN_AI_USAGE_COMPLETION_TOKENS: "gen_ai.usage.completion_tokens" --->>> ATTR_GEN_AI_USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens"
//
// --- LLM custom attributes replaced by OTel equivalents (v1.38+) ---
//
// SpanAttributes.LLM_REQUEST_TYPE: "llm.request.type"                   --->>> ATTR_GEN_AI_OPERATION_NAME: "gen_ai.operation.name"
//
// SpanAttributes.LLM_TOP_K: "llm.top_k"                                 --->>> ATTR_GEN_AI_REQUEST_TOP_K: "gen_ai.request.top_k"
//
// --- Cache token attributes (NEW in v1.40, replaces custom values) ---
//
// (custom) "gen_ai.usage.cache_creation_input_tokens"                   --->>> ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS: "gen_ai.usage.cache_creation.input_tokens"
//
// (custom) "gen_ai.usage.cache_read_input_tokens"                       --->>> ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS: "gen_ai.usage.cache_read.input_tokens"
//
// --- Span name format change ---
//
// (span name) "anthropic.chat" / "anthropic.completion"                 --->>> (span name) "chat {model}" / "text_completion {model}"
//
// --- New additions in v1.40 (no previous equivalent) ---
//
// (none)                                                                 --->>> ATTR_GEN_AI_AGENT_VERSION: "gen_ai.agent.version"
//
// (none)                                                                 --->>> GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL: "retrieval"
//
// --- MCP attributes (NEW in v1.39, present in v1.40) ---
//
// (custom) "mcp.request.id"                                             --->>> ATTR_MCP_SESSION_ID: "mcp.session.id" (closest equivalent — not a direct 1:1)
//
// (none)                                                                 --->>> ATTR_MCP_METHOD_NAME: "mcp.method.name"
//
// (none)                                                                 --->>> ATTR_MCP_PROTOCOL_VERSION: "mcp.protocol.version"
//
// (none)                                                                 --->>> ATTR_MCP_RESOURCE_URI: "mcp.resource.uri"
//
// =============================================================================
