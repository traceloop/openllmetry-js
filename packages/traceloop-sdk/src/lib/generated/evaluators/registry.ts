// Auto-generated - DO NOT EDIT
// Regenerate with: pnpm generate:evaluator-models

export interface EvaluatorSchema {
  slug: string;
  requiredInputFields: string[];
  optionalConfigFields: string[];
  description?: string;
}

export type EvaluatorSlug = 'agent-efficiency' | 'agent-flow-quality' | 'agent-goal-accuracy' | 'agent-goal-completeness' | 'agent-tool-error-detector' | 'agent-tool-trajectory' | 'answer-completeness' | 'answer-correctness' | 'answer-relevancy' | 'char-count' | 'char-count-ratio' | 'context-relevance' | 'conversation-quality' | 'faithfulness' | 'html-comparison' | 'instruction-adherence' | 'intent-change' | 'json-validator' | 'perplexity' | 'pii-detector' | 'placeholder-regex' | 'profanity-detector' | 'prompt-injection' | 'prompt-perplexity' | 'regex-validator' | 'secrets-detector' | 'semantic-similarity' | 'sexism-detector' | 'sql-validator' | 'tone-detection' | 'topic-adherence' | 'toxicity-detector' | 'uncertainty-detector' | 'word-count' | 'word-count-ratio';

export const EVALUATOR_SLUGS: EvaluatorSlug[] = [
  'agent-efficiency',
  'agent-flow-quality',
  'agent-goal-accuracy',
  'agent-goal-completeness',
  'agent-tool-error-detector',
  'agent-tool-trajectory',
  'answer-completeness',
  'answer-correctness',
  'answer-relevancy',
  'char-count',
  'char-count-ratio',
  'context-relevance',
  'conversation-quality',
  'faithfulness',
  'html-comparison',
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

export const EVALUATOR_SCHEMAS: Record<EvaluatorSlug, EvaluatorSchema> = {
  'agent-efficiency': {
    slug: 'agent-efficiency',
    requiredInputFields: ['trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: [],
    description: "Evaluate agent efficiency - detect redundant calls, unnecessary follow-ups\n\n**Request Body:**\n- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory",
  },
  'agent-flow-quality': {
    slug: 'agent-flow-quality',
    requiredInputFields: ['trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: ['conditions', 'threshold'],
    description: "Validate agent trajectory against user-defined conditions\n\n**Request Body:**\n- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory\n- `config.conditions` (array of strings, required): Array of evaluation conditions/rules to validate against\n- `config.threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)",
  },
  'agent-goal-accuracy': {
    slug: 'agent-goal-accuracy',
    requiredInputFields: ['completion', 'question', 'reference'],
    optionalConfigFields: [],
    description: "Evaluate agent goal accuracy\n\n**Request Body:**\n- `input.question` (string, required): The original question or goal\n- `input.completion` (string, required): The agent's completion/response\n- `input.reference` (string, required): The expected reference answer",
  },
  'agent-goal-completeness': {
    slug: 'agent-goal-completeness',
    requiredInputFields: ['trajectory_completions', 'trajectory_prompts'],
    optionalConfigFields: ['threshold'],
    description: "Measure if agent accomplished all user goals\n\n**Request Body:**\n- `input.trajectory_prompts` (string, required): JSON array of prompts in the agent trajectory\n- `input.trajectory_completions` (string, required): JSON array of completions in the agent trajectory\n- `config.threshold` (number, required): Score threshold for pass/fail determination (0.0-1.0)",
  },
  'agent-tool-error-detector': {
    slug: 'agent-tool-error-detector',
    requiredInputFields: ['tool_input', 'tool_output'],
    optionalConfigFields: [],
    description: "Detect errors or failures during tool execution\n\n**Request Body:**\n- `input.tool_input` (string, required): JSON string of the tool input\n- `input.tool_output` (string, required): JSON string of the tool output",
  },
  'agent-tool-trajectory': {
    slug: 'agent-tool-trajectory',
    requiredInputFields: ['executed_tool_calls', 'expected_tool_calls'],
    optionalConfigFields: ['input_params_sensitive', 'mismatch_sensitive', 'order_sensitive', 'threshold'],
    description: "Compare actual tool calls against expected reference tool calls\n\n**Request Body:**\n- `input.executed_tool_calls` (string, required): JSON array of actual tool calls made by the agent\n- `input.expected_tool_calls` (string, required): JSON array of expected/reference tool calls\n- `config.threshold` (float, optional): Score threshold for pass/fail determination (default: 0.5)\n- `config.mismatch_sensitive` (bool, optional): Whether tool calls must match exactly (default: false)\n- `config.order_sensitive` (bool, optional): Whether order of tool calls matters (default: false)\n- `config.input_params_sensitive` (bool, optional): Whether to compare input parameters (default: true)",
  },
  'answer-completeness': {
    slug: 'answer-completeness',
    requiredInputFields: ['completion', 'context', 'question'],
    optionalConfigFields: [],
    description: "Evaluate whether the answer is complete and contains all the necessary information\n\n**Request Body:**\n- `input.question` (string, required): The original question\n- `input.completion` (string, required): The completion to evaluate for completeness\n- `input.context` (string, required): The context that provides the complete information",
  },
  'answer-correctness': {
    slug: 'answer-correctness',
    requiredInputFields: ['completion', 'ground_truth', 'question'],
    optionalConfigFields: [],
    description: "Evaluate factual accuracy by comparing answers against ground truth\n\n**Request Body:**\n- `input.question` (string, required): The original question\n- `input.completion` (string, required): The completion to evaluate\n- `input.ground_truth` (string, required): The expected correct answer",
  },
  'answer-relevancy': {
    slug: 'answer-relevancy',
    requiredInputFields: ['answer', 'question'],
    optionalConfigFields: [],
    description: "Check if an answer is relevant to a question\n\n**Request Body:**\n- `input.answer` (string, required): The answer to evaluate for relevancy\n- `input.question` (string, required): The question that the answer should be relevant to",
  },
  'char-count': {
    slug: 'char-count',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Count the number of characters in text\n\n**Request Body:**\n- `input.text` (string, required): The text to count characters in",
  },
  'char-count-ratio': {
    slug: 'char-count-ratio',
    requiredInputFields: ['denominator_text', 'numerator_text'],
    optionalConfigFields: [],
    description: "Calculate the ratio of characters between two texts\n\n**Request Body:**\n- `input.numerator_text` (string, required): The numerator text (will be divided by denominator)\n- `input.denominator_text` (string, required): The denominator text (divides the numerator)",
  },
  'context-relevance': {
    slug: 'context-relevance',
    requiredInputFields: ['context', 'query'],
    optionalConfigFields: ['model'],
    description: "Evaluate whether retrieved context contains sufficient information to answer the query\n\n**Request Body:**\n- `input.query` (string, required): The query/question to evaluate context relevance for\n- `input.context` (string, required): The context to evaluate for relevance to the query\n- `config.model` (string, optional): Model to use for evaluation (default: gpt-4o)",
  },
  'conversation-quality': {
    slug: 'conversation-quality',
    requiredInputFields: ['completions', 'prompts'],
    optionalConfigFields: [],
    description: "Evaluate conversation quality based on tone, clarity, flow, responsiveness, and transparency\n\n**Request Body:**\n- `input.prompts` (string, required): JSON array of prompts in the conversation\n- `input.completions` (string, required): JSON array of completions in the conversation",
  },
  'faithfulness': {
    slug: 'faithfulness',
    requiredInputFields: ['completion', 'context', 'question'],
    optionalConfigFields: [],
    description: "Check if a completion is faithful to the provided context\n\n**Request Body:**\n- `input.completion` (string, required): The LLM completion to check for faithfulness\n- `input.context` (string, required): The context that the completion should be faithful to\n- `input.question` (string, required): The original question asked",
  },
  'html-comparison': {
    slug: 'html-comparison',
    requiredInputFields: ['html1', 'html2'],
    optionalConfigFields: [],
    description: "Compare two HTML documents for structural and content similarity\n\n**Request Body:**\n- `input.html1` (string, required): The first HTML document to compare\n- `input.html2` (string, required): The second HTML document to compare",
  },
  'instruction-adherence': {
    slug: 'instruction-adherence',
    requiredInputFields: ['instructions', 'response'],
    optionalConfigFields: [],
    description: "Evaluate how well responses follow given instructions\n\n**Request Body:**\n- `input.instructions` (string, required): The instructions that should be followed\n- `input.response` (string, required): The response to evaluate for instruction adherence",
  },
  'intent-change': {
    slug: 'intent-change',
    requiredInputFields: ['completions', 'prompts'],
    optionalConfigFields: [],
    description: "Detect changes in user intent between prompts and completions\n\n**Request Body:**\n- `input.prompts` (string, required): JSON array of prompts in the conversation\n- `input.completions` (string, required): JSON array of completions in the conversation",
  },
  'json-validator': {
    slug: 'json-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: ['enable_schema_validation', 'schema_string'],
    description: "Validate JSON syntax\n\n**Request Body:**\n- `input.text` (string, required): The text to validate as JSON\n- `config.enable_schema_validation` (bool, optional): Enable JSON schema validation\n- `config.schema_string` (string, optional): JSON schema to validate against",
  },
  'perplexity': {
    slug: 'perplexity',
    requiredInputFields: ['logprobs'],
    optionalConfigFields: [],
    description: "Measure text perplexity from logprobs\n\n**Request Body:**\n- `input.logprobs` (string, required): JSON array of log probabilities from the model",
  },
  'pii-detector': {
    slug: 'pii-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['probability_threshold'],
    description: "Detect personally identifiable information in text\n\n**Request Body:**\n- `input.text` (string, required): The text to scan for personally identifiable information\n- `config.probability_threshold` (float, optional): Detection threshold (default: 0.8)",
  },
  'placeholder-regex': {
    slug: 'placeholder-regex',
    requiredInputFields: ['placeholder_value', 'text'],
    optionalConfigFields: ['case_sensitive', 'dot_include_nl', 'multi_line', 'should_match'],
    description: "Validate text against a placeholder regex pattern\n\n**Request Body:**\n- `input.placeholder_value` (string, required): The regex pattern to match against\n- `input.text` (string, required): The text to validate against the regex pattern\n- `config.should_match` (bool, optional): Whether the text should match the regex\n- `config.case_sensitive` (bool, optional): Case-sensitive matching\n- `config.dot_include_nl` (bool, optional): Dot matches newlines\n- `config.multi_line` (bool, optional): Multi-line mode",
  },
  'profanity-detector': {
    slug: 'profanity-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect profanity in text\n\n**Request Body:**\n- `input.text` (string, required): The text to scan for profanity",
  },
  'prompt-injection': {
    slug: 'prompt-injection',
    requiredInputFields: ['prompt'],
    optionalConfigFields: ['threshold'],
    description: "Detect prompt injection attempts\n\n**Request Body:**\n- `input.prompt` (string, required): The prompt to check for injection attempts\n- `config.threshold` (float, optional): Detection threshold (default: 0.5)",
  },
  'prompt-perplexity': {
    slug: 'prompt-perplexity',
    requiredInputFields: ['prompt'],
    optionalConfigFields: [],
    description: "Measure prompt perplexity to detect potential injection attempts\n\n**Request Body:**\n- `input.prompt` (string, required): The prompt to calculate perplexity for",
  },
  'regex-validator': {
    slug: 'regex-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: ['case_sensitive', 'dot_include_nl', 'multi_line', 'regex', 'should_match'],
    description: "Validate text against a regex pattern\n\n**Request Body:**\n- `input.text` (string, required): The text to validate against a regex pattern\n- `config.regex` (string, optional): The regex pattern to match against\n- `config.should_match` (bool, optional): Whether the text should match the regex\n- `config.case_sensitive` (bool, optional): Case-sensitive matching\n- `config.dot_include_nl` (bool, optional): Dot matches newlines\n- `config.multi_line` (bool, optional): Multi-line mode",
  },
  'secrets-detector': {
    slug: 'secrets-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect secrets and credentials in text\n\n**Request Body:**\n- `input.text` (string, required): The text to scan for secrets (API keys, passwords, etc.)",
  },
  'semantic-similarity': {
    slug: 'semantic-similarity',
    requiredInputFields: ['completion', 'reference'],
    optionalConfigFields: [],
    description: "Calculate semantic similarity between completion and reference\n\n**Request Body:**\n- `input.completion` (string, required): The completion text to compare\n- `input.reference` (string, required): The reference text to compare against",
  },
  'sexism-detector': {
    slug: 'sexism-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['threshold'],
    description: "Detect sexist language and bias\n\n**Request Body:**\n- `input.text` (string, required): The text to scan for sexist content\n- `config.threshold` (float, optional): Detection threshold (default: 0.5)",
  },
  'sql-validator': {
    slug: 'sql-validator',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Validate SQL query syntax\n\n**Request Body:**\n- `input.text` (string, required): The text to validate as SQL",
  },
  'tone-detection': {
    slug: 'tone-detection',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Detect the tone of the text\n\n**Request Body:**\n- `input.text` (string, required): The text to detect the tone of",
  },
  'topic-adherence': {
    slug: 'topic-adherence',
    requiredInputFields: ['completion', 'question', 'reference_topics'],
    optionalConfigFields: [],
    description: "Evaluate topic adherence\n\n**Request Body:**\n- `input.question` (string, required): The original question\n- `input.completion` (string, required): The completion to evaluate\n- `input.reference_topics` (string, required): Comma-separated list of expected topics",
  },
  'toxicity-detector': {
    slug: 'toxicity-detector',
    requiredInputFields: ['text'],
    optionalConfigFields: ['threshold'],
    description: "Detect toxic or harmful language\n\n**Request Body:**\n- `input.text` (string, required): The text to scan for toxic content\n- `config.threshold` (float, optional): Detection threshold (default: 0.5)",
  },
  'uncertainty-detector': {
    slug: 'uncertainty-detector',
    requiredInputFields: ['prompt'],
    optionalConfigFields: [],
    description: "Detect uncertainty in the text\n\n**Request Body:**\n- `input.prompt` (string, required): The text to detect uncertainty in",
  },
  'word-count': {
    slug: 'word-count',
    requiredInputFields: ['text'],
    optionalConfigFields: [],
    description: "Count the number of words in text\n\n**Request Body:**\n- `input.text` (string, required): The text to count words in",
  },
  'word-count-ratio': {
    slug: 'word-count-ratio',
    requiredInputFields: ['denominator_text', 'numerator_text'],
    optionalConfigFields: [],
    description: "Calculate the ratio of words between two texts\n\n**Request Body:**\n- `input.numerator_text` (string, required): The numerator text (will be divided by denominator)\n- `input.denominator_text` (string, required): The denominator text (divides the numerator)",
  },
};

export function getEvaluatorSchema<S extends EvaluatorSlug>(slug: S): EvaluatorSchema {
  return EVALUATOR_SCHEMAS[slug];
}

export function isValidEvaluatorSlug(slug: string): slug is EvaluatorSlug {
  return slug in EVALUATOR_SCHEMAS;
}
