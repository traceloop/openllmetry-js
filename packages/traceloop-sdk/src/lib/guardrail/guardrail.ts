import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { ATTR_GEN_AI_OPERATION_NAME } from "@opentelemetry/semantic-conventions/incubating";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { getTracer } from "../tracing/tracing";
import { resolveGuardInputs } from "./default-mapper";
import {
  Guard,
  GuardCallResult,
  GuardedResult,
  GuardExecutionError,
  GuardResult,
  InputMapper,
  FailFastGuardResult,
} from "./model";
import { OnFailureHandler, resolveOnFailure } from "./on-failure";

const GuardrailOperationNames = {
  RUN: "guardrail.run",
  GUARD: "guard",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GuardrailsOptions {
  /**
   * Called when any guard returns false. Can be:
   * - `"raise"`: Throw GuardValidationError (default)
   * - `"log"`: Log a warning and return the original result
   * - `"ignore"`: Return the original result silently (shadow/observe mode)
   * - Any other string: Return that string as a fallback value
   * - Callable: Custom OnFailureHandler receiving a GuardedResult
   */
  onFailure?: string | OnFailureHandler;
  /** Identifier for this guardrail configuration. Used as the span name prefix. */
  name?: string;
  /**
   * If true, run all guards before handling failures.
   * If false (default), stop at the first failure (fail-fast).
   */
  runAll?: boolean;
  /**
   * If true (default), run guards in parallel for lower latency.
   * If false, run guards sequentially — useful when guard order matters.
   */
  parallel?: boolean;
  /**
   * Maps the guarded function's output to one input dict per guard.
   * Use this when the output is a structured object and different guards
   * need different fields. If omitted, the default mapper handles strings
   * and plain objects automatically.
   */
  inputMapper?: InputMapper;
}

export interface GuardOptions {
  onFailure?: string | OnFailureHandler;
  name?: string;
  parallel?: boolean;
  inputMapper?: InputMapper;
}

export interface ValidateOptions {
  name?: string;
  parallel?: boolean;
  inputMapper?: InputMapper;
}

export interface ValidateResult {
  passed: boolean;
  results: GuardResult[];
}

// ── Internal execution result ─────────────────────────────────────────────────

interface GuardExecutionResult {
  index: number;
  name: string;
  passed: boolean;
  duration: number;
  output?: Record<string, unknown>;
}

// ── Guardrails class (Tier 3) ────────────────────────────────────────────────

/**
 * Full-control guardrail runner with a fluent builder API.
 *
 * @param guards  - Guard functions to run. Each receives its corresponding input dict
 *                  and returns a boolean: true = pass, false = fail.
 * @param options - Optional configuration (onFailure, name, runAll, parallel, inputMapper).
 *
 * @example
 * const g = new Guardrails([toxicityGuard(), piiGuard()], { name: "safety", onFailure: "log" })
 *   .parallel()
 *   .runAll();
 *
 * const result = await g.run(async () => callLLM(prompt));
 */
export class Guardrails {
  // Guard<any> — class stays internally untyped so no generics bleed onto builder methods
  private readonly guards: Guard<any>[];
  private readonly _onFailure: OnFailureHandler;
  private readonly _name: string;
  private readonly _runAll: boolean;
  private readonly _parallel: boolean;
  private readonly _inputMapper?: InputMapper;

  constructor(guards: Guard<any>[], options?: GuardrailsOptions) {
    this.guards = guards;
    this._onFailure = resolveOnFailure(options?.onFailure ?? "raise");
    this._name = options?.name ?? "";
    this._runAll = options?.runAll ?? false;
    this._parallel = options?.parallel ?? true;
    this._inputMapper = options?.inputMapper;
  }

  // ── Builder methods (immutable — each returns a new instance) ────────────

  parallel(): Guardrails {
    return this._clone({ parallel: true });
  }

  sequential(): Guardrails {
    return this._clone({ parallel: false });
  }

  runAll(): Guardrails {
    return this._clone({ runAll: true });
  }

  failFast(): Guardrails {
    return this._clone({ runAll: false });
  }

  raiseOnFailure(): Guardrails {
    return this._clone({ onFailure: "raise" });
  }

  logOnFailure(): Guardrails {
    return this._clone({ onFailure: "log" });
  }

  ignoreOnFailure(): Guardrails {
    return this._clone({ onFailure: "ignore" });
  }

  onFailure(handler: string | OnFailureHandler): Guardrails {
    return this._clone({ onFailure: handler });
  }

  named(name: string): Guardrails {
    return this._clone({ name });
  }

  private _clone(overrides: Partial<GuardrailsOptions>): Guardrails {
    return new Guardrails(this.guards, {
      onFailure: this._onFailure,
      name: this._name,
      runAll: this._runAll,
      parallel: this._parallel,
      inputMapper: this._inputMapper,
      ...overrides,
    });
  }

  // ── run() — main entry point ─────────────────────────────────────────────

  /**
   * Runs an async function (typically an LLM call), then evaluates its output
   * through all configured guards.
   *
   * The LLM function runs first and its result is captured. Guards then evaluate
   * that result. If any guard fails, the configured `onFailure` handler is invoked.
   * If a guard throws a real error (network failure, API error), a
   * `GuardExecutionError` is thrown regardless of `onFailure`.
   *
   * @param fn   - The async function to run (e.g. your LLM call). Its return value
   *               is passed to the guards as input.
   * @param args - Arguments forwarded to `fn`.
   * @returns    The original return value of `fn` if all guards pass, or the
   *             `onFailure` handler's return value if any guard fails.
   *
   * @example
   * const result = await g.run(
   *   async (prompt) => openai.chat.completions.create(...),
   *   userPrompt,
   * );
   */
  async run<T>(
    fn: (...args: unknown[]) => Promise<T>,
    ...args: unknown[]
  ): Promise<T> {
    // Capture parent context BEFORE fn() runs so guard spans are siblings of
    // the LLM span, not children of it.
    const parentContext = context.active();

    // Execute the user's LLM function — instrumentation spans fire here
    const result = await fn(...args);

    const guardNames = this.guards.map((g, i) => g.guardName ?? `guard_${i}`);

    const guardInputs = resolveGuardInputs(
      result as string | Record<string, unknown>,
      this.guards.length,
      guardNames,
      this._inputMapper,
    );

    const guardResults = await this._executeGuards(
      guardInputs,
      guardNames,
      parentContext,
    );

    const failedResults = guardResults.filter((r) => !r.passed);

    if (failedResults.length === 0) {
      return result;
    }

    const guardedResult: GuardedResult = {
      result: result as string | Record<string, unknown>,
      guardInputs,
    };
    const fallback = this._onFailure(guardedResult);
    return (fallback ?? result) as T;
  }

  // ── validate() — direct validation without wrapping a function ────────────

  /**
   * Runs guards directly against pre-mapped inputs without wrapping an async function.
   *
   * Use this when you already have the guard inputs constructed — for example when
   * using sequential/failFast execution and you want to pass specific field values
   * to each guard rather than relying on automatic mapping.
   *
   * Unlike the standalone `validate()` function, this method does NOT do any input
   * mapping — you are responsible for providing one input dict per guard in the
   * correct order.
   *
   * @param guardInputs - Array of input dicts, one per guard, in the same order as
   *                      the guards passed to the constructor.
   * @returns Per-guard results: `[{ name, passed, duration }, ...]`
   *
   * @example
   * // Check a user prompt for injection before calling the LLM
   * const g = new Guardrails([promptInjectionGuard(), piiGuard()]);
   * const results = await g.validate([
   *   { prompt: userPrompt },
   *   { text: userPrompt },
   * ]);
   * if (results.every(r => r.passed)) {
   *   const response = await callLLM(userPrompt);
   * }
   */
  async validate(
    guardInputs: Record<string, unknown>[],
  ): Promise<GuardResult[]> {
    if (guardInputs.length !== this.guards.length) {
      throw new Error(
        `validate() expected ${this.guards.length} guard inputs, got ${guardInputs.length}. ` +
          `Provide exactly one input object per guard in the same order.`,
      );
    }

    const parentContext = context.active();
    const guardNames = this.guards.map((g, i) => g.guardName ?? `guard_${i}`);

    const guardResults = await this._executeGuards(
      guardInputs,
      guardNames,
      parentContext,
    );

    return guardResults.map((r) => ({
      name: r.name,
      passed: r.passed,
      duration: r.duration,
      ...(r.output !== undefined && { output: r.output }),
    }));
  }

  // ── Internal guard execution ─────────────────────────────────────────────

  private async _executeGuards(
    guardInputs: Record<string, unknown>[],
    guardNames: string[],
    parentContext: ReturnType<typeof trace.setSpan>,
  ): Promise<GuardExecutionResult[]> {
    if (this._parallel) {
      if (this._runAll) {
        // Collect ALL results even if some fail
        const promises = this.guards.map((guard, i) =>
          this._runSingleGuard(
            guard,
            guardInputs[i],
            guardNames[i],
            i,
            parentContext,
          ),
        );
        const settled = await Promise.allSettled(promises);
        // Re-throw the first GuardExecutionError — real errors always propagate
        for (const s of settled) {
          if (
            s.status === "rejected" &&
            s.reason instanceof GuardExecutionError
          ) {
            throw s.reason;
          }
        }
        return settled.map((s, i) =>
          s.status === "fulfilled"
            ? s.value
            : {
                index: i,
                name: guardNames[i],
                passed: false,
                duration: 0,
              },
        );
      } else {
        // parallel().failFast() — _runSingleGuard throws FailFastGuardResult on
        // logical failure so Promise.all rejects immediately. Real errors
        // (GuardExecutionError) propagate directly through Promise.all.
        const promises = this.guards.map((guard, i) =>
          this._runSingleGuard(
            guard,
            guardInputs[i],
            guardNames[i],
            i,
            parentContext,
            true,
          ),
        );
        // Suppress unhandled rejections from guards that settle AFTER Promise.all
        // already rejected. Without this, Node emits UnhandledPromiseRejection
        // warnings when two or more guards fail concurrently.
        promises.forEach((p) => p.catch(() => undefined));
        try {
          return await Promise.all(promises);
        } catch (err) {
          if (err instanceof FailFastGuardResult) {
            return [
              {
                index: err.index,
                name: err.name,
                passed: err.passed,
                duration: err.duration,
                output: err.output,
              },
            ];
          }
          throw err;
        }
      }
    } else {
      // Sequential execution
      const results: GuardExecutionResult[] = [];
      for (let i = 0; i < this.guards.length; i++) {
        const result = await this._runSingleGuard(
          this.guards[i],
          guardInputs[i],
          guardNames[i],
          i,
          parentContext,
        );
        results.push(result);
        if (!result.passed && !this._runAll) {
          break; // fail-fast
        }
      }
      return results;
    }
  }

  private async _runSingleGuard(
    guard: Guard<any>,
    input: Record<string, unknown>,
    name: string,
    index: number,
    parentContext: ReturnType<typeof trace.setSpan>,
    throwOnFail = false,
  ): Promise<GuardExecutionResult> {
    const tracer = getTracer();

    const guardSpan = tracer.startSpan(
      `${name}.guard`,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.GUARD,
          [SpanAttributes.GEN_AI_GUARDRAIL_NAME]: name,
          [SpanAttributes.GEN_AI_GUARDRAIL_INPUT]: JSON.stringify(input),
        },
      },
      parentContext,
    );

    const guardContext = trace.setSpan(parentContext, guardSpan);
    const startTime = performance.now();

    let passed: boolean;
    let output: Record<string, unknown> | undefined;
    try {
      const raw = await context.with(
        guardContext,
        () => guard(input) as Promise<boolean | GuardCallResult>,
      );
      // Pre-built guards return GuardCallResult ({ passed, output }) so the raw
      // API response is available to the caller. Custom user guards return a plain
      // boolean. Both are valid — the typeof check discriminates the union.
      if (typeof raw === "object" && raw !== null) {
        passed = raw.passed;
        output = raw.output;
      } else {
        passed = raw;
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      guardSpan.setAttributes({
        [SpanAttributes.GEN_AI_GUARDRAIL_STATUS]: "FAILED",
        [SpanAttributes.GEN_AI_GUARDRAIL_DURATION]: Math.round(duration),
        [SpanAttributes.GEN_AI_GUARDRAIL_ERROR_TYPE]: err.constructor.name,
        [SpanAttributes.GEN_AI_GUARDRAIL_ERROR_MESSAGE]: err.message,
      });
      guardSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      guardSpan.recordException(err);
      guardSpan.end();

      throw new GuardExecutionError(err, input, index);
    }

    const duration = performance.now() - startTime;
    guardSpan.setAttributes({
      [SpanAttributes.GEN_AI_GUARDRAIL_STATUS]: passed ? "PASSED" : "FAILED",
      [SpanAttributes.GEN_AI_GUARDRAIL_DURATION]: Math.round(duration),
    });
    guardSpan.end();

    const executionResult: GuardExecutionResult = {
      index,
      name,
      passed,
      duration,
      output,
    };
    if (!passed && throwOnFail) {
      throw new FailFastGuardResult(index, name, false, duration, output);
    }
    return executionResult;
  }
}

// ── Tier 1: guard() — returns a guarded function ──────────────────────────────

/**
 * Wraps an async function with guardrails. Returns a new function with the same signature.
 *
 * @example
 * const safeGenerate = guard(generateResponse, [toxicityGuard(), piiGuard()], {
 *   onFailure: "Sorry, blocked by content policy.",
 * });
 * const result = await safeGenerate("Tell me a joke");
 */
export function guard<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  guards: Guard<any>[],
  options?: GuardOptions,
): (...args: A) => Promise<R> {
  const g = new Guardrails(guards, options);
  return (...args: A) =>
    g.run(fn as (...args: unknown[]) => Promise<R>, ...args);
}

// ── Tier 2: validateContent() — standalone validation ────────────────────────────────

/**
 * Validates a string or object against a set of guards without wrapping a function.
 *
 * @example — simple guards, no inputMapper required:
 * const result = await validateContent("LLM response text", [toxicityGuard(), piiGuard()]);
 * if (!result.passed) {
 *   console.log("Failed:", result.results.filter(r => !r.passed));
 * }
 *
 * @example — complex guard with typed input, inputMapper required:
 * const result = await validateContent(llmOutput, [semanticSimilarityGuard()], {
 *   inputMapper: (output) => [{ text: output as string, reference: expectedAnswer }],
 * });
 */
// Overload 1: all guards use the base (untyped) input — inputMapper is optional
export async function validateContent(
  output: string | Record<string, unknown>,
  guards: Guard<Record<string, unknown>>[],
  options?: ValidateOptions,
): Promise<ValidateResult>;
// Overload 2: guards use a specific typed input TInput — inputMapper is required and must produce TInput
export async function validateContent<TInput extends Record<string, unknown>>(
  output: string | Record<string, unknown>,
  guards: Guard<TInput>[],
  options: ValidateOptions & {
    inputMapper: InputMapper<string | Record<string, unknown>, TInput>;
  },
): Promise<ValidateResult>;
// Implementation (not user-visible)
export async function validateContent(
  output: string | Record<string, unknown>,
  guards: Guard<any>[],
  options?: ValidateOptions,
): Promise<ValidateResult> {
  const g = new Guardrails(guards, { runAll: true, ...options });
  const guardNames = guards.map((guard, i) => guard.guardName ?? `guard_${i}`);
  const guardInputs = resolveGuardInputs(
    output,
    guards.length,
    guardNames,
    options?.inputMapper,
  );
  const results = await g.validate(guardInputs);
  return {
    passed: results.every((r) => r.passed),
    results,
  };
}

// ── Tier 4: @guardrail decorator ──────────────────────────────────────────────

/**
 * Decorator that wraps a class method with guardrails.
 *
 * @example
 * class MyService {
 *   \@guardrail([toxicityGuard()], { onFailure: "Sorry, blocked." })
 *   async generateResponse(prompt: string): Promise<string> { ... }
 * }
 */
export function guardrail(
  guards: Guard<any>[],
  options?: GuardOptions,
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const g = new Guardrails(guards, options);
      return g.run(
        (...innerArgs: unknown[]) => originalMethod.apply(this, innerArgs),
        ...args,
      );
    };

    return descriptor;
  };
}
