import { getFieldSynonyms } from "../client/evaluator/field-mapping";
import { InputMapper } from "./model";

/**
 * Creates a default input mapper that converts LLM output to guard inputs.
 *
 * - string output → { text, prompt, completion } replicated per guard
 * - plain object output → enriched with synonym aliases
 * - anything else → throws (user must provide a custom inputMapper)
 */
export function defaultInputMapper(
  output: unknown,
  numGuards: number,
): Record<string, unknown>[] {
  if (typeof output === "string") {
    const mapped: Record<string, unknown> = {
      text: output,
      prompt: output,
      completion: output,
    };
    return Array(numGuards).fill(mapped);
  }

  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const dict = output as Record<string, unknown>;
    const enriched: Record<string, unknown> = { ...dict };

    // Add synonym aliases for each key in the object
    for (const key of Object.keys(dict)) {
      const synonyms = getFieldSynonyms(key);
      for (const synonym of synonyms) {
        if (!(synonym in enriched)) {
          enriched[synonym] = dict[key];
        }
      }
    }

    return Array(numGuards).fill(enriched);
  }

  throw new Error(
    `Cannot automatically map output of type "${typeof output}" to guard inputs. ` +
      `Provide a custom inputMapper to handle this output type.`,
  );
}

/**
 * Resolve guard inputs from either a custom inputMapper or the default mapper.
 * Handles both list form (index-matched) and dict form (keyed by guard name).
 */
export function resolveGuardInputs(
  output: unknown,
  numGuards: number,
  guardNames: string[],
  inputMapper?: InputMapper,
): Record<string, unknown>[] {
  if (!inputMapper) {
    return defaultInputMapper(output, numGuards);
  }

  const mapped = inputMapper(output, numGuards);

  // Array form — index-matched
  if (Array.isArray(mapped)) {
    if (mapped.length !== numGuards) {
      throw new Error(
        `inputMapper returned ${mapped.length} inputs but there are ${numGuards} guards. ` +
          `The array must have exactly one entry per guard.`,
      );
    }
    return mapped;
  }

  // Dict form — keyed by guard name, resolve to ordered list
  const result: Record<string, unknown>[] = [];
  for (const name of guardNames) {
    if (!(name in mapped)) {
      throw new Error(
        `inputMapper returned a dict but no entry found for guard "${name}". ` +
          `Available keys: ${Object.keys(mapped).join(", ")}`,
      );
    }
    result.push(mapped[name]);
  }
  return result;
}
