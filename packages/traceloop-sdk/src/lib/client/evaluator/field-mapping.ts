/**
 * Field synonym mapping for evaluator input normalization.
 */

const SYNONYM_GROUPS: Set<string>[] = [
  new Set(["text", "completion", "answer", "response"]),
  new Set(["reference", "ground_truth", "context"]),
  new Set(["question", "prompt", "instructions", "query"]),
  new Set(["prompts", "trajectory_prompts"]),
  new Set(["completions", "trajectory_completions"]),
];

/**
 * Get all synonyms for a given field name, including the field itself.
 */
export function getFieldSynonyms(field: string): Set<string> {
  for (const group of SYNONYM_GROUPS) {
    if (group.has(field)) return group;
  }
  return new Set([field]);
}

/**
 * Normalize task output field names to match required evaluator fields using synonym mapping.
 */
export function normalizeTaskOutput(
  taskOutput: Record<string, unknown>,
  requiredFields: string[],
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const mappedKeys = new Set<string>();

  // First pass: map required fields from task output via exact match or synonym lookup
  for (const requiredField of requiredFields) {
    // Exact match takes priority
    if (Object.prototype.hasOwnProperty.call(taskOutput, requiredField)) {
      normalized[requiredField] = taskOutput[requiredField];
      mappedKeys.add(requiredField);
      continue;
    }

    // Look for a synonym present in task output
    const synonyms = getFieldSynonyms(requiredField);
    let foundKey: string | undefined;
    for (const synonym of synonyms) {
      if (Object.prototype.hasOwnProperty.call(taskOutput, synonym)) {
        foundKey = synonym;
        break;
      }
    }

    if (foundKey !== undefined) {
      normalized[requiredField] = taskOutput[foundKey];
      mappedKeys.add(foundKey);
    }
  }

  // Second pass: preserve fields that were not consumed by the mapping
  for (const [key, value] of Object.entries(taskOutput)) {
    if (
      !mappedKeys.has(key) &&
      !Object.prototype.hasOwnProperty.call(normalized, key)
    ) {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Get suggestions for a missing required field based on the available fields and synonym groups.
 */
export function getFieldSuggestions(
  missingField: string,
  availableFields: string[],
): string[] {
  const suggestions: string[] = [];
  const missingFieldSynonyms = getFieldSynonyms(missingField);

  for (const available of availableFields) {
    const availableSynonyms = getFieldSynonyms(available);
    for (const s of missingFieldSynonyms) {
      if (availableSynonyms.has(s)) {
        suggestions.push(available);
        break;
      }
    }
  }

  return suggestions;
}

/**
 * Format a help string showing all accepted synonyms for a required field.
 */
export function formatFieldHelp(field: string): string {
  const synonyms = getFieldSynonyms(field);
  if (synonyms.size === 1) {
    return `'${field}'`;
  }
  const others = [...synonyms]
    .filter((s) => s !== field)
    .sort()
    .map((s) => `'${s}'`)
    .join(", ");
  return `'${field}' (or synonyms: ${others})`;
}

/**
 * Minimal shape required to perform validation.
 * Avoids importing from experiment.interface to prevent circular dependencies.
 */
export interface EvaluatorWithRequiredFields {
  name?: string;
  requiredInputFields?: string[];
}

/**
 * Validate that task output contains all required fields for the given evaluators,
 * normalizing field names via synonym mapping first.
 *
 * Only evaluators that have requiredInputFields defined are validated.
 * Evaluators without requiredInputFields (e.g. plain string slugs resolved externally)
 * are skipped.
 */
export function validateAndNormalizeTaskOutput(
  taskOutput: Record<string, unknown>,
  evaluators: EvaluatorWithRequiredFields[],
): Record<string, unknown> {
  const evaluatorsWithFields = evaluators.filter(
    (e) => e.requiredInputFields && e.requiredInputFields.length > 0,
  );

  if (evaluatorsWithFields.length === 0) {
    return taskOutput;
  }

  // Collect all required fields across all evaluators for normalization
  const allRequiredFields: string[] = [];
  for (const evaluator of evaluatorsWithFields) {
    allRequiredFields.push(...(evaluator.requiredInputFields ?? []));
  }

  const normalizedOutput = normalizeTaskOutput(taskOutput, allRequiredFields);

  // Validate: check which required fields are still missing after normalization
  const missingFieldsByEvaluator = new Map<string, string[]>();

  for (const evaluator of evaluatorsWithFields) {
    if (!evaluator.requiredInputFields) continue;

    const missingFields = evaluator.requiredInputFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(normalizedOutput, field),
    );

    if (missingFields.length > 0) {
      const key = evaluator.name ?? "evaluator";
      const existing = missingFieldsByEvaluator.get(key) ?? [];
      missingFieldsByEvaluator.set(key, [...existing, ...missingFields]);
    }
  }

  if (missingFieldsByEvaluator.size > 0) {
    let message = "Task output missing required fields for evaluators:";

    for (const [slug, fields] of missingFieldsByEvaluator) {
      message += `\n  - ${slug} requires:`;
      for (const field of [...fields].sort()) {
        const suggestions = getFieldSuggestions(field, Object.keys(taskOutput));
        const fieldHelp = formatFieldHelp(field);
        if (suggestions.length > 0) {
          message += `\n      ${fieldHelp} - Did you mean: ${suggestions.join(", ")}?`;
        } else {
          message += `\n      ${fieldHelp}`;
        }
      }
    }

    message += `\n\nTask output contains: ${JSON.stringify(Object.keys(taskOutput))}`;
    message +=
      "\n\nHint: Update your task function to return an object with the required fields.";

    throw new Error(message);
  }

  return normalizedOutput;
}
