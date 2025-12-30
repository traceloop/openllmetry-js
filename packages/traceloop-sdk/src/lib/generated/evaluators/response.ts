// Auto-generated - DO NOT EDIT
// Generated from swagger.json by generate-evaluator-models.ts
//
// Regenerate with: pnpm generate:evaluator-models


export interface AgentEfficiencyResponse {
  step_efficiency_reason?: string;
  step_efficiency_score?: number;
  task_completion_reason?: string;
  task_completion_score?: number;
}

export interface AgentFlowQualityResponse {
  reason?: string;
  result?: string;
  score?: number;
}

export interface AgentGoalAccuracyResponse {
  accuracy_score?: number;
}

export interface AgentGoalCompletenessResponse {
  reason?: string;
  result?: string;
  score?: number;
}

export interface AgentToolErrorDetectorResponse {
  reason?: string;
  result?: string;
}

export interface AnswerCompletenessResponse {
  answer_completeness_score?: number;
}

export interface AnswerCorrectnessResponse {
  correctness_score?: number;
}

export interface AnswerRelevancyResponse {
  is_relevant?: boolean;
}

export interface CharCountResponse {
  char_count?: number;
}

export interface CharCountRatioResponse {
  char_ratio?: number;
}

export interface ContextRelevanceResponse {
  relevance_score?: number;
}

export interface ConversationQualityResponse {
  conversation_quality_score?: number;
}

export interface FaithfulnessResponse {
  is_faithful?: boolean;
}

export interface InstructionAdherenceResponse {
  instruction_adherence_score?: number;
}

export interface IntentChangeResponse {
  pass?: boolean;
  reason?: string;
  score?: number;
}

export interface JsonValidatorResponse {
  is_valid_json?: boolean;
}

export interface PerplexityResponse {
  perplexity_score?: number;
}

export interface PiiDetectorResponse {
  has_pii?: boolean;
}

export interface PlaceholderRegexResponse {
  is_valid_regex?: boolean;
}

export interface ProfanityDetectorResponse {
  has_profanity?: boolean;
}

export interface PromptInjectionResponse {
  has_injection?: string;
}

export interface PromptPerplexityResponse {
  perplexity_score?: number;
}

export interface RegexValidatorResponse {
  is_valid_regex?: boolean;
}

export interface SecretsDetectorResponse {
  has_secret?: boolean;
}

export interface SemanticSimilarityResponse {
  similarity_score?: number;
}

export interface SexismDetectorResponse {
  is_safe?: string;
}

export interface SqlValidatorResponse {
  is_valid_sql?: boolean;
}

export interface ToneDetectionResponse {
  score?: number;
  tone?: string;
}

export interface TopicAdherenceResponse {
  adherence_score?: number;
}

export interface ToxicityDetectorResponse {
  is_safe?: string;
}

export interface UncertaintyDetectorResponse {
  answer?: string;
  uncertainty?: number;
}

export interface WordCountResponse {
  word_count?: number;
}

export interface WordCountRatioResponse {
  word_ratio?: number;
}
