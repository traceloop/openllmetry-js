// Auto-generated - DO NOT EDIT
// Generated from swagger.json by generate-evaluator-models.ts
//
// Regenerate with: pnpm generate:evaluator-models

import type * as Request from './request';
import type * as Response from './response';

export interface EvaluatorSchema {
  slug: string;
  requiredInputFields: string[];
  optionalConfigFields: string[];
  description?: string;
}

export type EvaluatorSlug = 'agent-efficiency' | 'agent-flow-quality' | 'agent-goal-accuracy' | 'agent-goal-completeness' | 'agent-tool-error-detector' | 'answer-completeness' | 'answer-correctness' | 'answer-relevancy' | 'char-count' | 'char-count-ratio' | 'context-relevance' | 'conversation-quality' | 'faithfulness' | 'instruction-adherence' | 'intent-change' | 'json-validator' | 'perplexity' | 'pii-detector' | 'placeholder-regex' | 'profanity-detector' | 'prompt-injection' | 'prompt-perplexity' | 'regex-validator' | 'secrets-detector' | 'semantic-similarity' | 'sexism-detector' | 'sql-validator' | 'tone-detection' | 'topic-adherence' | 'toxicity-detector' | 'uncertainty-detector' | 'word-count' | 'word-count-ratio';

export const EVALUATOR_SLUGS: EvaluatorSlug[] = [
  'agent-efficiency',
  'agent-flow-quality',
  'agent-goal-accuracy',
  'agent-goal-completeness',
  'agent-tool-error-detector',
  'answer-completeness',
  'answer-correctness',
  'answer-relevancy',
  'char-count',
  'char-count-ratio',
  'context-relevance',
  'conversation-quality',
  'faithfulness',
  'instruction-adherence',
  'intent-change',
  'json-validator',
  'perplexity',
  'pii-detector',
  'placeholder-regex',
  'profanity-detector',
  'prompt-injection',
  'prompt-perplexity',
  'regex-validator',
  'secrets-detector',
  'semantic-similarity',
  'sexism-detector',
  'sql-validator',
  'tone-detection',
  'topic-adherence',
  'toxicity-detector',
  'uncertainty-detector',
  'word-count',
  'word-count-ratio',
];

export const REQUEST_MODELS: Record<EvaluatorSlug, unknown> = {
  'agent-efficiency': {} as Request.AgentEfficiencyRequest,
  'agent-flow-quality': {} as Request.AgentFlowQualityRequest,
  'agent-goal-accuracy': {} as Request.AgentGoalAccuracyRequest,
  'agent-goal-completeness': {} as Request.AgentGoalCompletenessRequest,
  'agent-tool-error-detector': {} as Request.AgentToolErrorDetectorRequest,
  'answer-completeness': {} as Request.AnswerCompletenessRequest,
  'answer-correctness': {} as Request.AnswerCorrectnessRequest,
  'answer-relevancy': {} as Request.AnswerRelevancyRequest,
  'char-count': {} as Request.CharCountRequest,
  'char-count-ratio': {} as Request.CharCountRatioRequest,
  'context-relevance': {} as Request.ContextRelevanceRequest,
  'conversation-quality': {} as Request.ConversationQualityRequest,
  'faithfulness': {} as Request.FaithfulnessRequest,
  'instruction-adherence': {} as Request.InstructionAdherenceRequest,
  'intent-change': {} as Request.IntentChangeRequest,
  'json-validator': {} as Request.JsonValidatorRequest,
  'perplexity': {} as Request.PerplexityRequest,
  'pii-detector': {} as Request.PiiDetectorRequest,
  'placeholder-regex': {} as Request.PlaceholderRegexRequest,
  'profanity-detector': {} as Request.ProfanityDetectorRequest,
  'prompt-injection': {} as Request.PromptInjectionRequest,
  'prompt-perplexity': {} as Request.PromptPerplexityRequest,
  'regex-validator': {} as Request.RegexValidatorRequest,
  'secrets-detector': {} as Request.SecretsDetectorRequest,
  'semantic-similarity': {} as Request.SemanticSimilarityRequest,
  'sexism-detector': {} as Request.SexismDetectorRequest,
  'sql-validator': {} as Request.SqlValidatorRequest,
  'tone-detection': {} as Request.ToneDetectionRequest,
  'topic-adherence': {} as Request.TopicAdherenceRequest,
  'toxicity-detector': {} as Request.ToxicityDetectorRequest,
  'uncertainty-detector': {} as Request.UncertaintyDetectorRequest,
  'word-count': {} as Request.WordCountRequest,
  'word-count-ratio': {} as Request.WordCountRatioRequest,
};

export const RESPONSE_MODELS: Record<EvaluatorSlug, unknown> = {
  'agent-efficiency': {} as Response.AgentEfficiencyResponse,
  'agent-flow-quality': {} as Response.AgentFlowQualityResponse,
  'agent-goal-accuracy': {} as Response.AgentGoalAccuracyResponse,
  'agent-goal-completeness': {} as Response.AgentGoalCompletenessResponse,
  'agent-tool-error-detector': {} as Response.AgentToolErrorDetectorResponse,
  'answer-completeness': {} as Response.AnswerCompletenessResponse,
  'answer-correctness': {} as Response.AnswerCorrectnessResponse,
  'answer-relevancy': {} as Response.AnswerRelevancyResponse,
  'char-count': {} as Response.CharCountResponse,
  'char-count-ratio': {} as Response.CharCountRatioResponse,
  'context-relevance': {} as Response.ContextRelevanceResponse,
  'conversation-quality': {} as Response.ConversationQualityResponse,
  'faithfulness': {} as Response.FaithfulnessResponse,
  'instruction-adherence': {} as Response.InstructionAdherenceResponse,
  'intent-change': {} as Response.IntentChangeResponse,
  'json-validator': {} as Response.JsonValidatorResponse,
  'perplexity': {} as Response.PerplexityResponse,
  'pii-detector': {} as Response.PiiDetectorResponse,
  'placeholder-regex': {} as Response.PlaceholderRegexResponse,
  'profanity-detector': {} as Response.ProfanityDetectorResponse,
  'prompt-injection': {} as Response.PromptInjectionResponse,
  'prompt-perplexity': {} as Response.PromptPerplexityResponse,
  'regex-validator': {} as Response.RegexValidatorResponse,
  'secrets-detector': {} as Response.SecretsDetectorResponse,
  'semantic-similarity': {} as Response.SemanticSimilarityResponse,
  'sexism-detector': {} as Response.SexismDetectorResponse,
  'sql-validator': {} as Response.SqlValidatorResponse,
  'tone-detection': {} as Response.ToneDetectionResponse,
  'topic-adherence': {} as Response.TopicAdherenceResponse,
  'toxicity-detector': {} as Response.ToxicityDetectorResponse,
  'uncertainty-detector': {} as Response.UncertaintyDetectorResponse,
  'word-count': {} as Response.WordCountResponse,
  'word-count-ratio': {} as Response.WordCountRatioResponse,
};

export const EVALUATOR_SCHEMAS: Record<EvaluatorSlug, EvaluatorSchema> = {
  'agent-efficiency': {
    slug: 'agent-efficiency',
    requiredInputFields: ['trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: [],
    description: "Evaluate agent efficiency - detect redundant calls, unnecessary follow-ups\n\n**Request Body:**\n- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory",
  },
  'agent-flow-quality': {
    slug: 'agent-flow-quality',
    requiredInputFields: ['conditions', 'threshold', 'trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: [],
    description: "Validate agent trajectory against user-defined conditions\n\n**Request Body:**\n- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory\n- `conditions` (array of strings, required): Array of evaluation conditions/rules to validate against\n- `threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)",
  },
  'agent-goal-accuracy': {
    slug: 'agent-goal-accuracy',
    requiredInputFields: ['completion', 'question', 'reference'],
    optionalConfigFields: [],
    description: "Evaluate agent goal accuracy\n\n**Request Body:**\n- `question` (string, required): The original question or goal\n- `completion` (string, required): The agent's completion/response\n- `reference` (string, required): The expected reference answer",
  },
  'agent-goal-completeness': {
    slug: 'agent-goal-completeness',
    requiredInputFields: ['threshold', 'trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: [],
    description: "Measure if agent accomplished all user goals\n\n**Request Body:**\n- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory\n- `threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)",
  },
  'agent-tool-error-detector': {
    slug: 'agent-tool-error-detector',
    requiredInputFields: ['tool_input', 'tool_output'],
    optionalConfigFields: [],
    description: "Detect errors or failures during tool execution\n\n**Request Body:**\n- `tool_input` (string, required): JSON string of the tool input\n- `tool_output` (string, required): JSON string of the tool output",
  },
  'answer-completeness': {
    slug: 'answer-completeness',
    requiredInputFields: ['completion', 'context', 'question'],
    optionalConfigFields: [],
    description: "Evaluate whether the answer is complete and contains all the necessary information\n\n**Request Body:**\n- `answer` (string, required): The answer to evaluate for completeness",
  },
  'answer-correctness': {
    slug: 'answer-correctness',
    requiredInputFields: ['completion', 'ground_truth', 'question'],
    optionalConfigFields: [],
    description: "Evaluate factual accuracy by comparing answers against ground truth\n\n**Request Body:**\n- `question` (string, required): The original question\n- `completion` (string, required): The completion to evaluate\n- `ground_truth` (string, required): The expected correct answer",
  },
  'answer-relevancy': {
    slug: 'answer-relevancy',
    requiredInputFields: ['answer', 'question'],
    optionalConfigFields: [],
    description: "Check if an answer is relevant to a question\n\n**Request Body:**\n- `answer` (string, required): The answer to evaluate for relevancy\n- `question` (string, required): The question that the answer should be relevant to",
  },
  'char-count': {
    slug: 'char-count',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Count the number of characters in text\n\n**Request Body:**\n- `text` (string, required): The text to count characters in",
  },
  'char-count-ratio': {
    slug: 'char-count-ratio',
    requiredInputFields: ['denominator_text', 'numerator_text'],
    optionalConfigFields: [],
    description: "Calculate the ratio of characters between two texts\n\n**Request Body:**\n- `numerator_text` (string, required): The numerator text (will be divided by denominator)\n- `denominator_text` (string, required): The denominator text (divides the numerator)",
  },
  'context-relevance': {
    slug: 'context-relevance',
    requiredInputFields: ['context', 'query'],
    optionalConfigFields: ['model'],
    description: "Evaluate whether retrieved context contains sufficient information to answer the query\n\n**Request Body:**\n- `query` (string, required): The query/question to evaluate context relevance for\n- `context` (string, required): The context to evaluate for relevance to the query",
  },
  'conversation-quality': {
    slug: 'conversation-quality',
    requiredInputFields: ['completions', 'prompts'],
    optionalConfigFields: ['model'],
    description: "Evaluate conversation quality based on tone, clarity, flow, responsiveness, and transparency\n\n**Request Body:**\n- `prompts` (string, required): JSON array of prompts in the conversation\n- `completions` (string, required): JSON array of completions in the conversation",
  },
  'faithfulness': {
    slug: 'faithfulness',
    requiredInputFields: ['completion', 'context', 'question'],
    optionalConfigFields: [],
    description: "Check if a completion is faithful to the provided context\n\n**Request Body:**\n- `completion` (string, required): The LLM completion to check for faithfulness\n- `context` (string, required): The context that the completion should be faithful to\n- `question` (string, required): The original question asked",
  },
  'instruction-adherence': {
    slug: 'instruction-adherence',
    requiredInputFields: ['instructions', 'response'],
    optionalConfigFields: [],
    description: "Evaluate how well responses follow given instructions\n\n**Request Body:**\n- `instructions` (string, required): The instructions that should be followed\n- `response` (string, required): The response to evaluate for instruction adherence",
  },
  'intent-change': {
    slug: 'intent-change',
    requiredInputFields: ['completions', 'prompts'],
    optionalConfigFields: ['model'],
    description: "Detect changes in user intent between prompts and completions\n\n**Request Body:**\n- `prompts` (string, required): JSON array of prompts in the conversation\n- `completions` (string, required): JSON array of completions in the conversation",
  },
  'json-validator': {
    slug: 'json-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: ['enable_schema_validation', 'schema_string'],
    description: "Validate JSON syntax\n\n**Request Body:**\n- `text` (string, required): The text to validate as JSON",
  },
  'perplexity': {
    slug: 'perplexity',
    requiredInputFields: ['logprobs'],
    optionalConfigFields: [],
    description: "Measure text perplexity from logprobs\n\n**Request Body:**\n- `logprobs` (string, required): JSON array of log probabilities from the model",
  },
  'pii-detector': {
    slug: 'pii-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['probability_threshold'],
    description: "Detect personally identifiable information in text\n\n**Request Body:**\n- `text` (string, required): The text to scan for personally identifiable information",
  },
  'placeholder-regex': {
    slug: 'placeholder-regex',
    requiredInputFields: ['placeholder_value', 'text'],
    optionalConfigFields: ['case_sensitive', 'dot_include_nl', 'multi_line', 'should_match'],
    description: "Validate text against a placeholder regex pattern\n\n**Request Body:**\n- `placeholder_value` (string, required): The regex pattern to match against\n- `text` (string, required): The text to validate against the regex pattern",
  },
  'profanity-detector': {
    slug: 'profanity-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect profanity in text\n\n**Request Body:**\n- `text` (string, required): The text to scan for profanity",
  },
  'prompt-injection': {
    slug: 'prompt-injection',
    requiredInputFields: ['prompt'],
    optionalConfigFields: ['threshold'],
    description: "Detect prompt injection attempts\n\n**Request Body:**\n- `prompt` (string, required): The prompt to check for injection attempts",
  },
  'prompt-perplexity': {
    slug: 'prompt-perplexity',
    requiredInputFields: ['prompt'],
    optionalConfigFields: [],
    description: "Measure prompt perplexity to detect potential injection attempts\n\n**Request Body:**\n- `prompt` (string, required): The prompt to calculate perplexity for",
  },
  'regex-validator': {
    slug: 'regex-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: ['case_sensitive', 'dot_include_nl', 'multi_line', 'regex', 'should_match'],
    description: "Validate text against a regex pattern\n\n**Request Body:**\n- `text` (string, required): The text to validate against a regex pattern",
  },
  'secrets-detector': {
    slug: 'secrets-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect secrets and credentials in text\n\n**Request Body:**\n- `text` (string, required): The text to scan for secrets (API keys, passwords, etc.)",
  },
  'semantic-similarity': {
    slug: 'semantic-similarity',
    requiredInputFields: ['completion', 'reference'],
    optionalConfigFields: [],
    description: "Calculate semantic similarity between completion and reference\n\n**Request Body:**\n- `completion` (string, required): The completion text to compare\n- `reference` (string, required): The reference text to compare against",
  },
  'sexism-detector': {
    slug: 'sexism-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['threshold'],
    description: "Detect sexist language and bias\n\n**Request Body:**\n- `text` (string, required): The text to scan for sexist content",
  },
  'sql-validator': {
    slug: 'sql-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Validate SQL query syntax\n\n**Request Body:**\n- `text` (string, required): The text to validate as SQL",
  },
  'tone-detection': {
    slug: 'tone-detection',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect the tone of the text\n\n**Request Body:**\n- `text` (string, required): The text to detect the tone of",
  },
  'topic-adherence': {
    slug: 'topic-adherence',
    requiredInputFields: ['completion', 'question', 'reference_topics'],
    optionalConfigFields: [],
    description: "Evaluate topic adherence\n\n**Request Body:**\n- `question` (string, required): The original question\n- `completion` (string, required): The completion to evaluate\n- `reference_topics` (string, required): Comma-separated list of expected topics",
  },
  'toxicity-detector': {
    slug: 'toxicity-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['threshold'],
    description: "Detect toxic or harmful language\n\n**Request Body:**\n- `text` (string, required): The text to scan for toxic content",
  },
  'uncertainty-detector': {
    slug: 'uncertainty-detector',
    requiredInputFields: ['prompt'],
    optionalConfigFields: [],
  },
  'word-count': {
    slug: 'word-count',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Count the number of words in text\n\n**Request Body:**\n- `text` (string, required): The text to count words in",
  },
  'word-count-ratio': {
    slug: 'word-count-ratio',
    requiredInputFields: ['denominator_text', 'numerator_text'],
    optionalConfigFields: [],
    description: "Calculate the ratio of words between two texts\n\n**Request Body:**\n- `numerator_text` (string, required): The numerator text (will be divided by denominator)\n- `denominator_text` (string, required): The denominator text (divides the numerator)",
  },
};

/**
 * Get the request model type for an evaluator slug
 */
export function getRequestModel<S extends EvaluatorSlug>(slug: S): (typeof REQUEST_MODELS)[S] {
  return REQUEST_MODELS[slug];
}

/**
 * Get the response model type for an evaluator slug
 */
export function getResponseModel<S extends EvaluatorSlug>(slug: S): (typeof RESPONSE_MODELS)[S] {
  return RESPONSE_MODELS[slug];
}

/**
 * Get the schema information for an evaluator slug
 */
export function getEvaluatorSchema<S extends EvaluatorSlug>(slug: S): EvaluatorSchema {
  return EVALUATOR_SCHEMAS[slug];
}

/**
 * Check if a slug is a valid MBT evaluator
 */
export function isValidEvaluatorSlug(slug: string): slug is EvaluatorSlug {
  return slug in EVALUATOR_SCHEMAS;
}
