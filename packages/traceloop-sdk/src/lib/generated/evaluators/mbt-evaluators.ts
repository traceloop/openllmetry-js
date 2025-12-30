// Auto-generated - DO NOT EDIT
// Generated from swagger.json by generate-evaluator-models.ts
//
// Regenerate with: pnpm generate:evaluator-models

import type { EvaluatorWithConfig } from '../../interfaces/experiment.interface';
import { EVALUATOR_SCHEMAS, isValidEvaluatorSlug, type EvaluatorSlug } from './registry';

export interface ContextRelevanceConfig {
  model?: string;
}

export interface ConversationQualityConfig {
  model?: string;
}

export interface IntentChangeConfig {
  model?: string;
}

export interface JsonValidatorConfig {
  enable_schema_validation?: boolean;
  schema_string?: string;
}

export interface PiiDetectorConfig {
  probability_threshold?: number;
}

export interface PlaceholderRegexConfig {
  case_sensitive?: boolean;
  dot_include_nl?: boolean;
  multi_line?: boolean;
  should_match?: boolean;
}

export interface PromptInjectionConfig {
  threshold?: number;
}

export interface RegexValidatorConfig {
  case_sensitive?: boolean;
  dot_include_nl?: boolean;
  multi_line?: boolean;
  regex?: string;
  should_match?: boolean;
}

export interface SexismDetectorConfig {
  threshold?: number;
}

export interface ToxicityDetectorConfig {
  threshold?: number;
}

/**
 * Create an EvaluatorWithConfig for the given slug with optional config.
 *
 * @param slug - The evaluator slug (e.g., 'pii-detector')
 * @param options - Optional version and config
 * @returns EvaluatorWithConfig configured for the specified evaluator
 *
 * @example
 * ```typescript
 * import { createEvaluator } from '@traceloop/node-server-sdk';
 *
 * const evaluator = createEvaluator('pii-detector', {
 *   config: { probability_threshold: 0.8 }
 * });
 * ```
 */
export function createEvaluator(
  slug: EvaluatorSlug,
  options?: {
    version?: string;
    config?: Record<string, unknown>;
  },
): EvaluatorWithConfig {
  if (!isValidEvaluatorSlug(slug)) {
    const availableSlugs = Object.keys(EVALUATOR_SCHEMAS).join(', ');
    throw new Error(`Unknown evaluator slug: '${slug}'. Available: ${availableSlugs}`);
  }

  const schema = EVALUATOR_SCHEMAS[slug];
  const result: EvaluatorWithConfig = {
    name: slug,
    version: options?.version || 'latest',
  };

  if (options?.config) {
    result.config = Object.fromEntries(
      Object.entries(options.config).filter(([, v]) => v !== undefined),
    );
  }

  if (schema?.requiredInputFields?.length) {
    result.requiredInputFields = schema.requiredInputFields;
  }

  return result;
}

/**
 * Validate evaluator input against schema.
 * Returns validation errors or null if valid.
 *
 * @param slug - The evaluator slug
 * @param input - The input to validate
 * @returns Array of error messages, or null if valid
 */
export function validateEvaluatorInput(
  slug: string,
  input: Record<string, unknown>,
): string[] | null {
  if (!isValidEvaluatorSlug(slug)) {
    return null;
  }

  const schema = EVALUATOR_SCHEMAS[slug];
  const errors: string[] = [];

  for (const field of schema.requiredInputFields) {
    if (!(field in input) || input[field] === undefined || input[field] === null) {
      errors.push(`Missing required input field: ${field}`);
    }
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Get list of available evaluator slugs.
 */
export function getAvailableEvaluatorSlugs(): EvaluatorSlug[] {
  return Object.keys(EVALUATOR_SCHEMAS) as EvaluatorSlug[];
}

/**
 * Get schema information for an evaluator.
 */
export function getEvaluatorSchemaInfo(
  slug: string,
): { requiredInputFields: string[]; optionalConfigFields: string[] } | undefined {
  if (!isValidEvaluatorSlug(slug)) {
    return undefined;
  }
  return EVALUATOR_SCHEMAS[slug];
}

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
  /**
   * Create an evaluator configuration for any slug.
   */
  static create(
    slug: EvaluatorSlug,
    options?: { version?: string; config?: Record<string, unknown> },
  ): EvaluatorWithConfig {
    return createEvaluator(slug, options);
  }

  /**
   * Get list of available evaluator slugs.
   */
  static getAvailableSlugs(): EvaluatorSlug[] {
    return getAvailableEvaluatorSlugs();
  }

  /**
   * Check if a slug is a valid MBT evaluator.
   */
  static isValidSlug(slug: string): slug is EvaluatorSlug {
    return isValidEvaluatorSlug(slug);
  }

  /**
   * Evaluate agent efficiency - detect redundant calls, unnecessary follow-ups

**Request Body:**
- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory
   *
   * Required task output fields: trajectory_completions, trajectory_prompts
   */
  static agentEfficiency(): EvaluatorWithConfig {
    return createEvaluator('agent-efficiency');
  }

  /**
   * Validate agent trajectory against user-defined conditions

**Request Body:**
- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory
- `conditions` (array of strings, required): Array of evaluation conditions/rules to validate against
- `threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)
   *
   * Required task output fields: conditions, threshold, trajectory_completions, trajectory_prompts
   */
  static agentFlowQuality(): EvaluatorWithConfig {
    return createEvaluator('agent-flow-quality');
  }

  /**
   * Evaluate agent goal accuracy

**Request Body:**
- `question` (string, required): The original question or goal
- `completion` (string, required): The agent's completion/response
- `reference` (string, required): The expected reference answer
   *
   * Required task output fields: completion, question, reference
   */
  static agentGoalAccuracy(): EvaluatorWithConfig {
    return createEvaluator('agent-goal-accuracy');
  }

  /**
   * Measure if agent accomplished all user goals

**Request Body:**
- `trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory
- `trajectory_completions` (string, required): JSON array of completions in the agent trajectory
- `threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)
   *
   * Required task output fields: threshold, trajectory_completions, trajectory_prompts
   */
  static agentGoalCompleteness(): EvaluatorWithConfig {
    return createEvaluator('agent-goal-completeness');
  }

  /**
   * Detect errors or failures during tool execution

**Request Body:**
- `tool_input` (string, required): JSON string of the tool input
- `tool_output` (string, required): JSON string of the tool output
   *
   * Required task output fields: tool_input, tool_output
   */
  static agentToolErrorDetector(): EvaluatorWithConfig {
    return createEvaluator('agent-tool-error-detector');
  }

  /**
   * Evaluate whether the answer is complete and contains all the necessary information

**Request Body:**
- `answer` (string, required): The answer to evaluate for completeness
   *
   * Required task output fields: completion, context, question
   */
  static answerCompleteness(): EvaluatorWithConfig {
    return createEvaluator('answer-completeness');
  }

  /**
   * Evaluate factual accuracy by comparing answers against ground truth

**Request Body:**
- `question` (string, required): The original question
- `completion` (string, required): The completion to evaluate
- `ground_truth` (string, required): The expected correct answer
   *
   * Required task output fields: completion, ground_truth, question
   */
  static answerCorrectness(): EvaluatorWithConfig {
    return createEvaluator('answer-correctness');
  }

  /**
   * Check if an answer is relevant to a question

**Request Body:**
- `answer` (string, required): The answer to evaluate for relevancy
- `question` (string, required): The question that the answer should be relevant to
   *
   * Required task output fields: answer, question
   */
  static answerRelevancy(): EvaluatorWithConfig {
    return createEvaluator('answer-relevancy');
  }

  /**
   * Count the number of characters in text

**Request Body:**
- `text` (string, required): The text to count characters in
   *
   * Required task output fields: text
   */
  static charCount(): EvaluatorWithConfig {
    return createEvaluator('char-count');
  }

  /**
   * Calculate the ratio of characters between two texts

**Request Body:**
- `numerator_text` (string, required): The numerator text (will be divided by denominator)
- `denominator_text` (string, required): The denominator text (divides the numerator)
   *
   * Required task output fields: denominator_text, numerator_text
   */
  static charCountRatio(): EvaluatorWithConfig {
    return createEvaluator('char-count-ratio');
  }

  /**
   * Evaluate whether retrieved context contains sufficient information to answer the query

**Request Body:**
- `query` (string, required): The query/question to evaluate context relevance for
- `context` (string, required): The context to evaluate for relevance to the query
   *
   * Required task output fields: context, query
   */
  static contextRelevance(config?: ContextRelevanceConfig): EvaluatorWithConfig {
    return createEvaluator('context-relevance', { config: config as Record<string, unknown> });
  }

  /**
   * Evaluate conversation quality based on tone, clarity, flow, responsiveness, and transparency

**Request Body:**
- `prompts` (string, required): JSON array of prompts in the conversation
- `completions` (string, required): JSON array of completions in the conversation
   *
   * Required task output fields: completions, prompts
   */
  static conversationQuality(config?: ConversationQualityConfig): EvaluatorWithConfig {
    return createEvaluator('conversation-quality', { config: config as Record<string, unknown> });
  }

  /**
   * Check if a completion is faithful to the provided context

**Request Body:**
- `completion` (string, required): The LLM completion to check for faithfulness
- `context` (string, required): The context that the completion should be faithful to
- `question` (string, required): The original question asked
   *
   * Required task output fields: completion, context, question
   */
  static faithfulness(): EvaluatorWithConfig {
    return createEvaluator('faithfulness');
  }

  /**
   * Evaluate how well responses follow given instructions

**Request Body:**
- `instructions` (string, required): The instructions that should be followed
- `response` (string, required): The response to evaluate for instruction adherence
   *
   * Required task output fields: instructions, response
   */
  static instructionAdherence(): EvaluatorWithConfig {
    return createEvaluator('instruction-adherence');
  }

  /**
   * Detect changes in user intent between prompts and completions

**Request Body:**
- `prompts` (string, required): JSON array of prompts in the conversation
- `completions` (string, required): JSON array of completions in the conversation
   *
   * Required task output fields: completions, prompts
   */
  static intentChange(config?: IntentChangeConfig): EvaluatorWithConfig {
    return createEvaluator('intent-change', { config: config as Record<string, unknown> });
  }

  /**
   * Validate JSON syntax

**Request Body:**
- `text` (string, required): The text to validate as JSON
   *
   * Required task output fields: text
   */
  static jsonValidator(config?: JsonValidatorConfig): EvaluatorWithConfig {
    return createEvaluator('json-validator', { config: config as Record<string, unknown> });
  }

  /**
   * Measure text perplexity from logprobs

**Request Body:**
- `logprobs` (string, required): JSON array of log probabilities from the model
   *
   * Required task output fields: logprobs
   */
  static perplexity(): EvaluatorWithConfig {
    return createEvaluator('perplexity');
  }

  /**
   * Detect personally identifiable information in text

**Request Body:**
- `text` (string, required): The text to scan for personally identifiable information
   *
   * Required task output fields: text
   */
  static piiDetector(config?: PiiDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('pii-detector', { config: config as Record<string, unknown> });
  }

  /**
   * Validate text against a placeholder regex pattern

**Request Body:**
- `placeholder_value` (string, required): The regex pattern to match against
- `text` (string, required): The text to validate against the regex pattern
   *
   * Required task output fields: placeholder_value, text
   */
  static placeholderRegex(config?: PlaceholderRegexConfig): EvaluatorWithConfig {
    return createEvaluator('placeholder-regex', { config: config as Record<string, unknown> });
  }

  /**
   * Detect profanity in text

**Request Body:**
- `text` (string, required): The text to scan for profanity
   *
   * Required task output fields: text
   */
  static profanityDetector(): EvaluatorWithConfig {
    return createEvaluator('profanity-detector');
  }

  /**
   * Detect prompt injection attempts

**Request Body:**
- `prompt` (string, required): The prompt to check for injection attempts
   *
   * Required task output fields: prompt
   */
  static promptInjection(config?: PromptInjectionConfig): EvaluatorWithConfig {
    return createEvaluator('prompt-injection', { config: config as Record<string, unknown> });
  }

  /**
   * Measure prompt perplexity to detect potential injection attempts

**Request Body:**
- `prompt` (string, required): The prompt to calculate perplexity for
   *
   * Required task output fields: prompt
   */
  static promptPerplexity(): EvaluatorWithConfig {
    return createEvaluator('prompt-perplexity');
  }

  /**
   * Validate text against a regex pattern

**Request Body:**
- `text` (string, required): The text to validate against a regex pattern
   *
   * Required task output fields: text
   */
  static regexValidator(config?: RegexValidatorConfig): EvaluatorWithConfig {
    return createEvaluator('regex-validator', { config: config as Record<string, unknown> });
  }

  /**
   * Detect secrets and credentials in text

**Request Body:**
- `text` (string, required): The text to scan for secrets (API keys, passwords, etc.)
   *
   * Required task output fields: text
   */
  static secretsDetector(): EvaluatorWithConfig {
    return createEvaluator('secrets-detector');
  }

  /**
   * Calculate semantic similarity between completion and reference

**Request Body:**
- `completion` (string, required): The completion text to compare
- `reference` (string, required): The reference text to compare against
   *
   * Required task output fields: completion, reference
   */
  static semanticSimilarity(): EvaluatorWithConfig {
    return createEvaluator('semantic-similarity');
  }

  /**
   * Detect sexist language and bias

**Request Body:**
- `text` (string, required): The text to scan for sexist content
   *
   * Required task output fields: text
   */
  static sexismDetector(config?: SexismDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('sexism-detector', { config: config as Record<string, unknown> });
  }

  /**
   * Validate SQL query syntax

**Request Body:**
- `text` (string, required): The text to validate as SQL
   *
   * Required task output fields: text
   */
  static sqlValidator(): EvaluatorWithConfig {
    return createEvaluator('sql-validator');
  }

  /**
   * Detect the tone of the text

**Request Body:**
- `text` (string, required): The text to detect the tone of
   *
   * Required task output fields: text
   */
  static toneDetection(): EvaluatorWithConfig {
    return createEvaluator('tone-detection');
  }

  /**
   * Evaluate topic adherence

**Request Body:**
- `question` (string, required): The original question
- `completion` (string, required): The completion to evaluate
- `reference_topics` (string, required): Comma-separated list of expected topics
   *
   * Required task output fields: completion, question, reference_topics
   */
  static topicAdherence(): EvaluatorWithConfig {
    return createEvaluator('topic-adherence');
  }

  /**
   * Detect toxic or harmful language

**Request Body:**
- `text` (string, required): The text to scan for toxic content
   *
   * Required task output fields: text
   */
  static toxicityDetector(config?: ToxicityDetectorConfig): EvaluatorWithConfig {
    return createEvaluator('toxicity-detector', { config: config as Record<string, unknown> });
  }

  /**
   * UncertaintyDetector evaluator.
   *
   * Required task output fields: prompt
   */
  static uncertaintyDetector(): EvaluatorWithConfig {
    return createEvaluator('uncertainty-detector');
  }

  /**
   * Count the number of words in text

**Request Body:**
- `text` (string, required): The text to count words in
   *
   * Required task output fields: text
   */
  static wordCount(): EvaluatorWithConfig {
    return createEvaluator('word-count');
  }

  /**
   * Calculate the ratio of words between two texts

**Request Body:**
- `numerator_text` (string, required): The numerator text (will be divided by denominator)
- `denominator_text` (string, required): The denominator text (divides the numerator)
   *
   * Required task output fields: denominator_text, numerator_text
   */
  static wordCountRatio(): EvaluatorWithConfig {
    return createEvaluator('word-count-ratio');
  }
}
