import { trace } from "@opentelemetry/api";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { getClient } from "../configuration";
import { isTrue, ConditionValue } from "./conditions";
import { Guard } from "./model";

export interface PrebuiltGuardOptions {
  /** Override the default pass/fail condition. Default: isTrue() */
  condition?: (v: ConditionValue) => boolean;
  /** Maximum time to wait for the evaluator API response in ms. Default: 60000 */
  timeoutMs?: number;
  /** Evaluator-specific configuration (e.g. threshold). */
  config?: Record<string, unknown>;
}

// ── Guard registry ────────────────────────────────────────────────────────────
// Each entry binds the evaluator slug (POST /v2/guardrails/{slug}/execute) to
// the condition field extracted from the API response { result: { ... } }.
// Verified against staging 2026-04-20. If the defensive check in createPrebuiltGuard
// throws a "field missing" error, update the relevant entry here.

const GUARDS = {
  TOXICITY: { slug: "toxicity-detector", conditionField: "is_safe" },
  PII: { slug: "pii-detector", conditionField: "has_pii" },
  SECRETS: { slug: "secrets-detector", conditionField: "has_secret" }, // Note: no trailing 's'
  PROMPT_INJECTION: {
    slug: "prompt-injection",
    conditionField: "has_injection",
  },
  PROFANITY: { slug: "profanity-detector", conditionField: "is_safe" },
  SEXISM: { slug: "sexism-detector", conditionField: "is_safe" },
  JSON_VALIDATOR: { slug: "json-validator", conditionField: "is_valid_json" },
  SQL_VALIDATOR: { slug: "sql-validator", conditionField: "is_valid_sql" },
  REGEX_VALIDATOR: {
    slug: "regex-validator",
    conditionField: "is_valid_regex",
  },
  INSTRUCTION_ADHERENCE: {
    slug: "instruction-adherence",
    conditionField: "instruction_adherence_score",
  }, // 0-1, pass >= 0.5
  SEMANTIC_SIMILARITY: {
    slug: "semantic-similarity",
    conditionField: "similarity_score",
  }, // 0-1, pass >= 0.7 — API returns "similarity_score" not "is_similar"
  PROMPT_PERPLEXITY: { slug: "prompt-perplexity", conditionField: "is_valid" },
  UNCERTAINTY: { slug: "uncertainty-detector", conditionField: "uncertainty" }, // 0-1, pass < 0.5 (inverted)
  TONE_DETECTION: { slug: "tone-detection", conditionField: "score" }, // 0-1, pass >= 0.5
} as const;

// ── Internal factory ──────────────────────────────────────────────────────────

/**
 * Internal factory for pre-built guards that call /v2/guardrails/{slug}/execute.
 */
function createPrebuiltGuard(
  slug: string,
  conditionField: string,
  options?: PrebuiltGuardOptions,
): Guard {
  const condition = options?.condition ?? isTrue();
  const timeoutMs = options?.timeoutMs ?? 60000;
  const config = options?.config;

  const guard: Guard = async (input: Record<string, unknown>) => {
    // Client resolved LAZILY — safe to create guards before initialize()
    const client = getClient();

    const body: Record<string, unknown> = { input };
    if (config) {
      body.config = config;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let data: Record<string, unknown>;
    try {
      const response = await client.post(
        `/v2/guardrails/${encodeURIComponent(slug)}/execute`,
        body,
        controller.signal,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Guardrail API returned ${response.status}: ${text}`);
      }

      data = await response.json();
    } finally {
      clearTimeout(timeoutId);
    }

    const result = (data.result ?? {}) as Record<string, unknown>;
    const value = result[conditionField];

    // Guard against API drift — if the expected field is missing, fail loudly
    // rather than silently applying condition(undefined) which would always
    // return false and make the guard fail with no explanation.
    if (value === undefined) {
      throw new Error(
        `Guard "${slug}": expected field "${conditionField}" in API response but it was missing. ` +
          `Got: ${JSON.stringify(result)}. ` +
          `This may indicate an API contract change — update GUARDS in guards.ts.`,
      );
    }

    // Set output on the active guard span if there is one
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute(
        SpanAttributes.GEN_AI_GUARDRAIL_OUTPUT,
        JSON.stringify(result),
      );
    }

    return condition(value as ConditionValue);
  };

  // Tag the guard function with its name for span naming
  guard.guardName = slug;
  return guard;
}

// ── Pre-built guard factories ────────────────────────────────────────────────

export function toxicityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.TOXICITY.slug,
    GUARDS.TOXICITY.conditionField,
    options,
  );
}

export function piiGuard(options?: PrebuiltGuardOptions): Guard {
  // Passes when PII is NOT detected (has_pii === false)
  return createPrebuiltGuard(GUARDS.PII.slug, GUARDS.PII.conditionField, {
    ...options,
    condition: options?.condition ?? ((v) => v === false),
  });
}

export function secretsGuard(options?: PrebuiltGuardOptions): Guard {
  // Passes when secrets are NOT detected (has_secret === false)
  return createPrebuiltGuard(
    GUARDS.SECRETS.slug,
    GUARDS.SECRETS.conditionField,
    {
      ...options,
      condition: options?.condition ?? ((v) => v === false),
    },
  );
}

export function promptInjectionGuard(options?: PrebuiltGuardOptions): Guard {
  // Passes when injection is NOT detected (has_injection === false)
  // API requires input field "prompt" — default mapper always includes it.
  return createPrebuiltGuard(
    GUARDS.PROMPT_INJECTION.slug,
    GUARDS.PROMPT_INJECTION.conditionField,
    {
      ...options,
      condition: options?.condition ?? ((v) => v === false),
    },
  );
}

export function profanityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.PROFANITY.slug,
    GUARDS.PROFANITY.conditionField,
    options,
  );
}

export function sexismGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.SEXISM.slug,
    GUARDS.SEXISM.conditionField,
    options,
  );
}

export function jsonValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.JSON_VALIDATOR.slug,
    GUARDS.JSON_VALIDATOR.conditionField,
    options,
  );
}

export function sqlValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.SQL_VALIDATOR.slug,
    GUARDS.SQL_VALIDATOR.conditionField,
    options,
  );
}

export function regexValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  // Config: { regex: string, should_match?: boolean, case_sensitive?: boolean, ... }
  return createPrebuiltGuard(
    GUARDS.REGEX_VALIDATOR.slug,
    GUARDS.REGEX_VALIDATOR.conditionField,
    options,
  );
}

export function instructionAdherenceGuard(
  options?: PrebuiltGuardOptions,
): Guard {
  // Returns a 0-1 score. Pass when score >= 0.5.
  // Requires input fields: "instructions" + "response".
  return createPrebuiltGuard(
    GUARDS.INSTRUCTION_ADHERENCE.slug,
    GUARDS.INSTRUCTION_ADHERENCE.conditionField,
    {
      ...options,
      condition:
        options?.condition ?? ((v) => typeof v === "number" && v >= 0.5),
    },
  );
}

export function semanticSimilarityGuard(options?: PrebuiltGuardOptions): Guard {
  // Returns similarity_score (0-1). Pass when score >= 0.7.
  // Requires input fields: "text" (or "completion") + "reference".
  return createPrebuiltGuard(
    GUARDS.SEMANTIC_SIMILARITY.slug,
    GUARDS.SEMANTIC_SIMILARITY.conditionField,
    {
      ...options,
      condition:
        options?.condition ?? ((v) => typeof v === "number" && v >= 0.7),
    },
  );
}

export function promptPerplexityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard(
    GUARDS.PROMPT_PERPLEXITY.slug,
    GUARDS.PROMPT_PERPLEXITY.conditionField,
    options,
  );
}

export function uncertaintyGuard(options?: PrebuiltGuardOptions): Guard {
  // Returns a 0-1 uncertainty score. Pass when uncertainty is LOW (< 0.5).
  // Requires input fields: "prompt" + "completion".
  return createPrebuiltGuard(
    GUARDS.UNCERTAINTY.slug,
    GUARDS.UNCERTAINTY.conditionField,
    {
      ...options,
      condition:
        options?.condition ?? ((v) => typeof v === "number" && v < 0.5),
    },
  );
}

export function toneDetectionGuard(options?: PrebuiltGuardOptions): Guard {
  // Returns { tone: string, score: float } where score = confidence in the detected tone.
  // Default condition (score >= 0.5) checks that a tone was confidently detected —
  // it does NOT filter by tone type. Both positive and negative tones can score >= 0.5.
  // To filter by specific tone, override condition: e.g. eq("joy"), eq("neutral").
  return createPrebuiltGuard(
    GUARDS.TONE_DETECTION.slug,
    GUARDS.TONE_DETECTION.conditionField,
    {
      ...options,
      condition:
        options?.condition ?? ((v) => typeof v === "number" && v >= 0.5),
    },
  );
}

// ── Custom evaluator guard ───────────────────────────────────────────────────

export interface CustomEvaluatorGuardOptions {
  evaluatorVersion?: string;
  evaluatorConfig?: Record<string, unknown>;
  /** Which field in result to check. Default: "pass" */
  conditionField?: string;
  /** Override the default condition. Default: isTrue() */
  condition?: (v: ConditionValue) => boolean;
  /** Maximum time to wait for result in ms. Default: 60000 */
  timeoutMs?: number;
}

/**
 * Guard backed by a user-defined evaluator on the Traceloop platform.
 * Calls POST /v2/evaluators/{slug}/executions and polls for the result.
 */
export function customEvaluatorGuard(
  slug: string,
  options?: CustomEvaluatorGuardOptions,
): Guard {
  const conditionField = options?.conditionField ?? "pass";
  const condition = options?.condition ?? isTrue();
  const timeoutMs = options?.timeoutMs ?? 60000;
  const evaluatorVersion = options?.evaluatorVersion;
  const evaluatorConfig = options?.evaluatorConfig;

  const guard: Guard = async (input: Record<string, unknown>) => {
    const client = getClient();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let resultData: Record<string, unknown>;
    try {
      // Step 1: Trigger evaluator execution
      const payload: Record<string, unknown> = {
        input_schema_mapping: Object.fromEntries(
          Object.entries(input).map(([k, v]) => [k, { source: v }]),
        ),
      };
      if (evaluatorVersion) payload.evaluator_version = evaluatorVersion;
      if (evaluatorConfig) payload.evaluator_config = evaluatorConfig;

      const triggerResponse = await client.post(
        `/v2/evaluators/${encodeURIComponent(slug)}/executions`,
        payload,
        controller.signal,
      );

      if (!triggerResponse.ok) {
        const text = await triggerResponse.text().catch(() => "");
        throw new Error(
          `Custom evaluator trigger returned ${triggerResponse.status}: ${text}`,
        );
      }

      const triggerData = await triggerResponse.json();
      const executionId: string =
        triggerData.executionId ?? triggerData.execution_id;
      const streamUrl: string = triggerData.streamUrl ?? triggerData.stream_url;

      if (!executionId || !streamUrl) {
        throw new Error(
          `Custom evaluator trigger response missing executionId or streamUrl: ${JSON.stringify(triggerData)}`,
        );
      }

      // Step 2: Poll for result via stream URL using client.get() so auth headers
      // are handled internally — no need to access private baseUrl/apiKey fields.
      // Accept: text/event-stream matches Python SDK behavior — server holds the
      // connection open (blocking long-poll) until the LLM job completes, then
      // returns the result as JSON and closes the connection.
      const resolvedStreamUrl = streamUrl.startsWith("/v2")
        ? streamUrl
        : `/v2${streamUrl}`;
      const resultResponse = await client.get(
        resolvedStreamUrl,
        controller.signal,
        {
          Accept: "text/event-stream",
        },
      );

      if (!resultResponse.ok) {
        const text = await resultResponse.text().catch(() => "");
        throw new Error(
          `Custom evaluator result returned ${resultResponse.status}: ${text}`,
        );
      }

      resultData = await resultResponse.json();
    } finally {
      clearTimeout(timeoutId);
    }

    const evaluatorResult =
      (resultData.result as Record<string, unknown>)?.evaluator_result ??
      (resultData.result as Record<string, unknown>) ??
      {};

    const value = (evaluatorResult as Record<string, unknown>)[conditionField];

    // Guard against API drift
    if (value === undefined) {
      throw new Error(
        `Custom evaluator guard "${slug}": expected field "${conditionField}" in result but it was missing. ` +
          `Got: ${JSON.stringify(evaluatorResult)}. ` +
          `This may indicate an API contract change or wrong conditionField — check your evaluator's output schema.`,
      );
    }

    // Set output on active span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute(
        SpanAttributes.GEN_AI_GUARDRAIL_OUTPUT,
        JSON.stringify(evaluatorResult),
      );
    }

    return condition(value as ConditionValue);
  };

  guard.guardName = slug;
  return guard;
}
