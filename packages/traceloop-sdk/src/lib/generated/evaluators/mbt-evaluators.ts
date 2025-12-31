// Auto-generated - DO NOT EDIT
// Regenerate with: pnpm generate:evaluator-models

import type { EvaluatorWithConfig } from '../../interfaces/experiment.interface';
import type { components } from './types';
import { EVALUATOR_SLUGS, EVALUATOR_SCHEMAS, isValidEvaluatorSlug, type EvaluatorSlug, type EvaluatorSchema } from './registry';

// Config type aliases from generated OpenAPI types
export type AgentFlowQualityConfig = components['schemas']['request.AgentFlowQualityRequest']['config'];
export type AgentGoalCompletenessConfig = components['schemas']['request.AgentGoalCompletenessRequest']['config'];
export type ContextRelevanceConfig = components['schemas']['request.ContextRelevanceRequest']['config'];
export type ConversationQualityConfig = components['schemas']['request.ConversationQualityRequest']['config'];
export type IntentChangeConfig = components['schemas']['request.IntentChangeRequest']['config'];
export type JsonValidatorConfig = components['schemas']['request.JSONValidatorRequest']['config'];
export type PiiDetectorConfig = components['schemas']['request.PIIDetectorRequest']['config'];
export type PlaceholderRegexConfig = components['schemas']['request.PlaceholderRegexRequest']['config'];
export type PromptInjectionConfig = components['schemas']['request.PromptInjectionRequest']['config'];
export type RegexValidatorConfig = components['schemas']['request.RegexValidatorRequest']['config'];
export type SexismDetectorConfig = components['schemas']['request.SexismDetectorRequest']['config'];
export type ToxicityDetectorConfig = components['schemas']['request.ToxicityDetectorRequest']['config'];

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an evaluator configuration object.
 */
export function createEvaluator(
  slug: EvaluatorSlug,
  options?: { version?: string; config?: Record<string, unknown> }
): EvaluatorWithConfig {
  return {
    name: slug,
    version: options?.version,
    config: options?.config,
  };
}

/**
 * Validate that required input fields are present in task output.
 */
export function validateEvaluatorInput(
  slug: EvaluatorSlug,
  taskOutput: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const schema = EVALUATOR_SCHEMAS[slug];
  if (!schema) {
    return { valid: false, missingFields: [] };
  }

  const missingFields = schema.requiredInputFields.filter(
    (field) => !(field in taskOutput) || taskOutput[field] === undefined
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Get all available evaluator slugs.
 */
export function getAvailableEvaluatorSlugs(): EvaluatorSlug[] {
  return [...EVALUATOR_SLUGS];
}

/**
 * Get schema information for an evaluator.
 */
export function getEvaluatorSchemaInfo(slug: EvaluatorSlug): EvaluatorSchema | undefined {
  return EVALUATOR_SCHEMAS[slug];
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory class for creating type-safe MBT evaluator configurations.
 *
 * @example
 * ```typescript
 * import { EvaluatorMadeByTraceloop } from '@traceloop/node-server-sdk';
 *
 * const evaluators = [
 *   EvaluatorMadeByTraceloop.piiDetector({ probability_threshold: 0.8 }),
 *   EvaluatorMadeByTraceloop.faithfulness(),
 * ];
 * ```
 */
export class EvaluatorMadeByTraceloop {
  static create(slug: EvaluatorSlug, options?: { version?: string; config?: Record<string, unknown> }): EvaluatorWithConfig {
    return createEvaluator(slug, options);
  }

  static getAvailableSlugs(): EvaluatorSlug[] {
    return getAvailableEvaluatorSlugs();
  }

  static isValidSlug(slug: string): slug is EvaluatorSlug {
    return isValidEvaluatorSlug(slug);
  }

  /**
   * Evaluate agent efficiency - detect redundant calls, unnecessary follow-ups

**Request Body:**
- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory
   * Required task output fields: trajectory_completions, trajectory_prompts
   */
  static agentEfficiency(): EvaluatorWithConfig {
    return createEvaluator('agent-efficiency');
  }

  /**
   * Validate agent trajectory against user-defined conditions

**Request Body:**
- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory
- `config.conditions` (array of strings, required): Array of evaluation conditions/rules to validate against
- `config.threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)
   * Required task output fields: trajectory_completions, trajectory_prompts
   */
  static agentFlowQuality(config?: AgentFlowQualityConfig): EvaluatorWithConfig {
    return createEvaluator('agent-flow-quality', { config: config as Record<string, unknown> });
  }

  /**
   * Evaluate agent goal accuracy

**Request Body:**
- `input.question` (string, required): The original question or goal
- `input.completion` (string, required): The agent's completion/response
- `input.reference` (string, required): The expected reference answer
   * Required task output fields: completion, question, reference
   */
  static agentGoalAccuracy(): EvaluatorWithConfig {
    return createEvaluator('agent-goal-accuracy');
  }

  /**
   * Measure if agent accomplished all user goals

**Request Body:**
- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory
- `config.threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)
   * Required task output fields: trajectory_completions, trajectory_prompts
   */
  static agentGoalCompleteness(config?: AgentGoalCompletenessConfig): EvaluatorWithConfig {
    return createEvaluator('agent-goal-completeness', { config: config as Record<string, unknown> });
  }

  /**
   * Detect errors or failures during tool execution

**Request Body:**
- `input.tool_input` (string, required): JSON string of the tool input
- `input.tool_output` (string, required): JSON string of the tool output
   * Required task output fields: tool_input, tool_output
   */
  static agentToolErrorDetector(): EvaluatorWithConfig {
    return createEvaluator('agent-tool-error-detector');
  }

  /**
   * Evaluate whether the answer is complete and contains all the necessary information

**Request Body:**
- `input.question` (string, required): The original question
- `input.completion` (string, required): The completion to evaluate for completeness
- `input.context` (string, required): The context that provides the complete information
   * Required task output fields: completion, context, question
   */
  static answerCompleteness(): EvaluatorWithConfig {
    return createEvaluator('answer-completeness');
  }

  /**
   * Evaluate factual accuracy by comparing answers against ground truth

**Request Body:**
- `input.question` (string, required): The original question
- `input.completion` (string, required): The completion to evaluate
- `input.ground_truth` (string, required): The expected correct answer
   * Required task output fields: completion, ground_truth, question
   */
  static answerCorrectness(): EvaluatorWithConfig {
    return createEvaluator('answer-correctness');
  }

  /**
   * Check if an answer is relevant to a question

**Request Body:**
- `input.answer` (string, required): The answer to evaluate for relevancy
- `input.question` (string, required): The question that the answer should be relevant to
   * Required task output fields: answer, question
   */
  static answerRelevancy(): EvaluatorWithConfig {
    return createEvaluator('answer-relevancy');
  }

  /**
   * Count the number of characters in text

**Request Body:**
- `input.text` (string, required): The text to count characters in
   * Required task output fields: text
   */
  static charCount(): EvaluatorWithConfig {
    return createEvaluator('char-count');
  }

  /**
   * Calculate the ratio of characters between two texts

**Request Body:**
- `input.numerator_text` (string, required): The numerator text (will be divided by denominator)
- `input.denominator_text` (string, required): The denominator text (divides the numerator)
   * Required task output fields: denominator_text, numerator_text
   */
  static charCountRatio(): EvaluatorWithConfig {
    return createEvaluator('char-count-ratio');
  }

  /**
   * Evaluate whether retrieved context contains sufficient information to answer the query

**Request Body:**
- `input.query` (string, required): The query/question to evaluate context relevance for
- `input.context` (string, required): The context to evaluate for relevance to the query
- `config.model` (string, optional): Model to use for evaluation (default: gpt-4o)
   * Required task output fields: context, query
   */
  static contextRelevance(config?: ContextRelevanceConfig): EvaluatorWithConfig {
    return createEvaluator('context-relevance', { config: config as Record<string, unknown> });
  }

  /**
   * Evaluate conversation quality based on tone, clarity, flow, responsiveness, and transparency

**Request Body:**
- `input.prompts` (string, required): JSON array of prompts in the conversation
- `input.completions` (string, required): JSON array of completions in the conversation
- `config.model` (string, optional): Model to use for evaluation (default: gpt-4o)
   * Required task output fields: completions, prompts
   */
  static conversationQuality(config?: ConversationQualityConfig): EvaluatorWithConfig {
    return createEvaluator('conversation-quality', { config: config as Record<string, unknown> });
  }

  /**
   * Check if a completion is faithful to the provided context

**Request Body:**
- `input.completion` (string, required): The LLM completion to check for faithfulness
- `input.context` (string, required): The context that the completion should be faithful to
- `input.question` (string, required): The original question asked
   * Required task output fields: completion, context, question
   */
  static faithfulness(): EvaluatorWithConfig {
    return createEvaluator('faithfulness');
  }

  /**
   * Evaluate how well responses follow given instructions

**Request Body:**
- `input.instructions` (string, required): The instructions that should be followed
- `input.response` (string, required): The response to evaluate for instruction adherence
   * Required task output fields: instructions, response
   */
  static instructionAdherence(): EvaluatorWithConfig {
    return createEvaluator('instruction-adherence');
  }

  /**
   * Detect changes in user intent between prompts and completions

**Request Body:**
- `input.prompts` (string, required): JSON array of prompts in the conversation
- `input.completions` (string, required): JSON array of completions in the conversation
- `config.model` (string, optional): Model to use for evaluation (default: gpt-4o)
   * Required task output fields: completions, prompts
   */
  static intentChange(config?: IntentChangeConfig): EvaluatorWithConfig {
    return createEvaluator('intent-change', { config: config as Record<string, unknown> });
  }

  /**
   * Validate JSON syntax

**Request Body:**
- `input.text` (string, required): The text to validate as JSON
- `config.enable_schema_validation` (bool, optional): Enable JSON schema validation
- `config.schema_string` (string, optional): JSON schema to validate against
   * Required task output fields: text
   */
  static jsonValidator(config?: JsonValidatorConfig): EvaluatorWithConfig {
    return createEvaluator('json-validator', { config: config as Record<string, unknown> });
  }

  /**
   * Measure text perplexity from logprobs

**Request Body:**
- `input.logprobs` (string, required): JSON array of log probabilities from the model
   * Required task output fields: logprobs
   */
  static perplexity(): EvaluatorWithConfig {
    return createEvaluator('perplexity');
  }

  /**
   * Detect personally identifiable information in text

**Request Body:**
- `input.text` (string, required): The text to scan for personally identifiable information
- `config.probability_threshold` (float, optional): Detection threshold (default: 0.8)
   * Required task output fields: text
   */
  static piiDetector(config?: PiiDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('pii-detector', { config: config as Record<string, unknown> });
  }

  /**
   * Validate text against a placeholder regex pattern

**Request Body:**
- `input.placeholder_value` (string, required): The regex pattern to match against
- `input.text` (string, required): The text to validate against the regex pattern
- `config.should_match` (bool, optional): Whether the text should match the regex
- `config.case_sensitive` (bool, optional): Case-sensitive matching
- `config.dot_include_nl` (bool, optional): Dot matches newlines
- `config.multi_line` (bool, optional): Multi-line mode
   * Required task output fields: placeholder_value, text
   */
  static placeholderRegex(config?: PlaceholderRegexConfig): EvaluatorWithConfig {
    return createEvaluator('placeholder-regex', { config: config as Record<string, unknown> });
  }

  /**
   * Detect profanity in text

**Request Body:**
- `input.text` (string, required): The text to scan for profanity
   * Required task output fields: text
   */
  static profanityDetector(): EvaluatorWithConfig {
    return createEvaluator('profanity-detector');
  }

  /**
   * Detect prompt injection attempts

**Request Body:**
- `input.prompt` (string, required): The prompt to check for injection attempts
- `config.threshold` (float, optional): Detection threshold (default: 0.5)
   * Required task output fields: prompt
   */
  static promptInjection(config?: PromptInjectionConfig): EvaluatorWithConfig {
    return createEvaluator('prompt-injection', { config: config as Record<string, unknown> });
  }

  /**
   * Measure prompt perplexity to detect potential injection attempts

**Request Body:**
- `input.prompt` (string, required): The prompt to calculate perplexity for
   * Required task output fields: prompt
   */
  static promptPerplexity(): EvaluatorWithConfig {
    return createEvaluator('prompt-perplexity');
  }

  /**
   * Validate text against a regex pattern

**Request Body:**
- `input.text` (string, required): The text to validate against a regex pattern
- `config.regex` (string, optional): The regex pattern to match against
- `config.should_match` (bool, optional): Whether the text should match the regex
- `config.case_sensitive` (bool, optional): Case-sensitive matching
- `config.dot_include_nl` (bool, optional): Dot matches newlines
- `config.multi_line` (bool, optional): Multi-line mode
   * Required task output fields: text
   */
  static regexValidator(config?: RegexValidatorConfig): EvaluatorWithConfig {
    return createEvaluator('regex-validator', { config: config as Record<string, unknown> });
  }

  /**
   * Detect secrets and credentials in text

**Request Body:**
- `input.text` (string, required): The text to scan for secrets (API keys, passwords, etc.)
   * Required task output fields: text
   */
  static secretsDetector(): EvaluatorWithConfig {
    return createEvaluator('secrets-detector');
  }

  /**
   * Calculate semantic similarity between completion and reference

**Request Body:**
- `input.completion` (string, required): The completion text to compare
- `input.reference` (string, required): The reference text to compare against
   * Required task output fields: completion, reference
   */
  static semanticSimilarity(): EvaluatorWithConfig {
    return createEvaluator('semantic-similarity');
  }

  /**
   * Detect sexist language and bias

**Request Body:**
- `input.text` (string, required): The text to scan for sexist content
- `config.threshold` (float, optional): Detection threshold (default: 0.5)
   * Required task output fields: text
   */
  static sexismDetector(config?: SexismDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('sexism-detector', { config: config as Record<string, unknown> });
  }

  /**
   * Validate SQL query syntax

**Request Body:**
- `input.text` (string, required): The text to validate as SQL
   * Required task output fields: text
   */
  static sqlValidator(): EvaluatorWithConfig {
    return createEvaluator('sql-validator');
  }

  /**
   * Detect the tone of the text

**Request Body:**
- `input.text` (string, required): The text to detect the tone of
   * Required task output fields: text
   */
  static toneDetection(): EvaluatorWithConfig {
    return createEvaluator('tone-detection');
  }

  /**
   * Evaluate topic adherence

**Request Body:**
- `input.question` (string, required): The original question
- `input.completion` (string, required): The completion to evaluate
- `input.reference_topics` (string, required): Comma-separated list of expected topics
   * Required task output fields: completion, question, reference_topics
   */
  static topicAdherence(): EvaluatorWithConfig {
    return createEvaluator('topic-adherence');
  }

  /**
   * Detect toxic or harmful language

**Request Body:**
- `input.text` (string, required): The text to scan for toxic content
- `config.threshold` (float, optional): Detection threshold (default: 0.5)
   * Required task output fields: text
   */
  static toxicityDetector(config?: ToxicityDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('toxicity-detector', { config: config as Record<string, unknown> });
  }

  /**
   * Detect uncertainty in the text

**Request Body:**
- `input.prompt` (string, required): The text to detect uncertainty in
   * Required task output fields: prompt
   */
  static uncertaintyDetector(): EvaluatorWithConfig {
    return createEvaluator('uncertainty-detector');
  }

  /**
   * Count the number of words in text

**Request Body:**
- `input.text` (string, required): The text to count words in
   * Required task output fields: text
   */
  static wordCount(): EvaluatorWithConfig {
    return createEvaluator('word-count');
  }

  /**
   * Calculate the ratio of words between two texts

**Request Body:**
- `input.numerator_text` (string, required): The numerator text (will be divided by denominator)
- `input.denominator_text` (string, required): The denominator text (divides the numerator)
   * Required task output fields: denominator_text, numerator_text
   */
  static wordCountRatio(): EvaluatorWithConfig {
    return createEvaluator('word-count-ratio');
  }
}
