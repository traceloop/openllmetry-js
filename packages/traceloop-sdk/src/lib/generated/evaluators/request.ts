// Auto-generated - DO NOT EDIT
// Generated from swagger.json by generate-evaluator-models.ts
//
// Regenerate with: pnpm generate:evaluator-models


export interface AgentEfficiencyRequest {
  trajectory_completions: string;
  trajectory_prompts: string;
}

export interface AgentFlowQualityRequest {
  conditions: string[];
  threshold: number;
  trajectory_completions: string;
  trajectory_prompts: string;
}

export interface AgentGoalAccuracyRequest {
  completion: string;
  question: string;
  reference: string;
}

export interface AgentGoalCompletenessRequest {
  threshold: number;
  trajectory_completions: string;
  trajectory_prompts: string;
}

export interface AgentToolErrorDetectorRequest {
  tool_input: string;
  tool_output: string;
}

export interface AnswerCompletenessRequest {
  completion: string;
  context: string;
  question: string;
}

export interface AnswerCorrectnessRequest {
  completion: string;
  ground_truth: string;
  question: string;
}

export interface AnswerRelevancyRequest {
  answer: string;
  question: string;
}

export interface CharCountRequest {
  text: string;
}

export interface CharCountRatioRequest {
  denominator_text: string;
  numerator_text: string;
}

export interface ContextRelevanceRequest {
  context: string;
  model?: string;
  query: string;
}

export interface ConversationQualityRequest {
  completions: string;
  model?: string;
  prompts: string;
}

export interface FaithfulnessRequest {
  completion: string;
  context: string;
  question: string;
}

export interface InstructionAdherenceRequest {
  instructions: string;
  response: string;
}

export interface IntentChangeRequest {
  completions: string;
  model?: string;
  prompts: string;
}

export interface JsonValidatorRequest {
  enable_schema_validation?: boolean;
  schema_string?: string;
  text: string;
}

export interface PerplexityRequest {
  logprobs: string;
}

export interface PiiDetectorRequest {
  probability_threshold?: number;
  text: string;
}

export interface PlaceholderRegexRequest {
  case_sensitive?: boolean;
  dot_include_nl?: boolean;
  multi_line?: boolean;
  placeholder_value: string;
  should_match?: boolean;
  text: string;
}

export interface ProfanityDetectorRequest {
  text: string;
}

export interface PromptInjectionRequest {
  prompt: string;
  threshold?: number;
}

export interface PromptPerplexityRequest {
  prompt: string;
}

export interface RegexValidatorRequest {
  case_sensitive?: boolean;
  dot_include_nl?: boolean;
  multi_line?: boolean;
  regex?: string;
  should_match?: boolean;
  text: string;
}

export interface SecretsDetectorRequest {
  text: string;
}

export interface SemanticSimilarityRequest {
  completion: string;
  reference: string;
}

export interface SexismDetectorRequest {
  text: string;
  threshold?: number;
}

export interface SqlValidatorRequest {
  text: string;
}

export interface ToneDetectionRequest {
  text: string;
}

export interface TopicAdherenceRequest {
  completion: string;
  question: string;
  reference_topics: string;
}

export interface ToxicityDetectorRequest {
  text: string;
  threshold?: number;
}

export interface UncertaintyDetectorRequest {
  prompt: string;
}

export interface WordCountRequest {
  text: string;
}

export interface WordCountRatioRequest {
  denominator_text: string;
  numerator_text: string;
}
