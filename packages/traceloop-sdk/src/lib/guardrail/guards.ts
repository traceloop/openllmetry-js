import { trace } from "@opentelemetry/api";
import { getClient } from "../configuration";
import { isTrue } from "./conditions";
import { Guard } from "./model";
import { GuardrailSpanAttributes } from "./span-attributes";

export interface PrebuiltGuardOptions {
  /** Override the default pass/fail condition. Default: isTrue() */
  condition?: (v: unknown) => boolean;
  /** Maximum time to wait for the evaluator API response in ms. Default: 60000 */
  timeoutMs?: number;
  /** Evaluator-specific configuration (e.g. threshold). */
  config?: Record<string, unknown>;
}

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
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Guardrail API returned ${response.status}: ${text}`,
        );
      }

      data = await response.json();
    } finally {
      clearTimeout(timeoutId);
    }

    const result = (data.result ?? {}) as Record<string, unknown>;
    const value = result[conditionField];

    // Set output on the active guard span if there is one
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute(
        GuardrailSpanAttributes.OUTPUT,
        JSON.stringify(result),
      );
    }

    return condition(value);
  };

  // Tag the guard function with its name for span naming
  (guard as any).guardName = slug;
  return guard;
}

// ── Pre-built guard factories ────────────────────────────────────────────────

export function toxicityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("toxicity-detector", "is_safe", options);
}

export function piiGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("pii-detector", "has_pii", {
    ...options,
    // pii passes when has_pii is FALSE (not detected)
    condition: options?.condition ?? ((v) => v === false),
  });
}

export function secretsGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("secrets-detector", "has_secrets", {
    ...options,
    condition: options?.condition ?? ((v) => v === false),
  });
}

export function promptInjectionGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("prompt-injection", "has_injection", {
    ...options,
    condition: options?.condition ?? ((v) => v === false),
  });
}

export function profanityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("profanity-detector", "is_safe", options);
}

export function sexismGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("sexism-detector", "is_safe", options);
}

export function jsonValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("json-validator", "is_valid_json", options);
}

export function sqlValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("sql-validator", "is_valid_sql", options);
}

export function regexValidatorGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("regex-validator", "is_valid", options);
}

export function instructionAdherenceGuard(
  options?: PrebuiltGuardOptions,
): Guard {
  return createPrebuiltGuard(
    "instruction-adherence",
    "is_adherent",
    options,
  );
}

export function semanticSimilarityGuard(
  options?: PrebuiltGuardOptions,
): Guard {
  return createPrebuiltGuard("semantic-similarity", "is_similar", options);
}

export function promptPerplexityGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("prompt-perplexity", "is_valid", options);
}

export function uncertaintyGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("uncertainty-detector", "is_certain", options);
}

export function toneDetectionGuard(options?: PrebuiltGuardOptions): Guard {
  return createPrebuiltGuard("tone-detection", "is_appropriate", options);
}

// ── Custom evaluator guard ───────────────────────────────────────────────────

export interface CustomEvaluatorGuardOptions {
  evaluatorVersion?: string;
  evaluatorConfig?: Record<string, unknown>;
  /** Which field in result to check. Default: "pass" */
  conditionField?: string;
  /** Override the default condition. Default: isTrue() */
  condition?: (v: unknown) => boolean;
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
    );

    if (!triggerResponse.ok) {
      const text = await triggerResponse.text().catch(() => "");
      throw new Error(
        `Custom evaluator trigger returned ${triggerResponse.status}: ${text}`,
      );
    }

    const triggerData = await triggerResponse.json();
    const executionId: string = triggerData.executionId ?? triggerData.execution_id;
    const streamUrl: string = triggerData.streamUrl ?? triggerData.stream_url;

    if (!executionId || !streamUrl) {
      throw new Error(
        `Custom evaluator trigger response missing executionId or streamUrl: ${JSON.stringify(triggerData)}`,
      );
    }

    // Step 2: Poll for result via stream URL
    const baseUrl: string = (client as any).baseUrl;
    const fullStreamUrl = `${baseUrl}/v2${streamUrl}`;
    const apiKey: string = (client as any).apiKey;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let resultData: Record<string, unknown>;
    try {
      const resultResponse = await fetch(fullStreamUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });

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

    // Set output on active span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute(
        GuardrailSpanAttributes.OUTPUT,
        JSON.stringify(evaluatorResult),
      );
    }

    return condition(value);
  };

  (guard as any).guardName = slug;
  return guard;
}
