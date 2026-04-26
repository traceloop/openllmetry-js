import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { ATTR_GEN_AI_OPERATION_NAME } from "@opentelemetry/semantic-conventions/incubating";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { getTracer } from "../tracing/tracing";
import { defaultInputMapper, resolveGuardInputs } from "./default-mapper";
import {
  Guard,
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
  onFailure?: string | OnFailureHandler;
  name?: string;
  runAll?: boolean;
  parallel?: boolean;
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
}

// ── Guardrails class (Tier 3) ────────────────────────────────────────────────

export class Guardrails {
  private readonly guards: Guard[];
  private readonly _onFailure: OnFailureHandler;
  private readonly _name: string;
  private readonly _runAll: boolean;
  private readonly _parallel: boolean;
  private readonly _inputMapper?: InputMapper;

  constructor(options: GuardrailsOptions, guards: Guard[]) {
    this.guards = guards;
    this._onFailure = resolveOnFailure(options.onFailure ?? "raise");
    this._name = options.name ?? "";
    this._runAll = options.runAll ?? false;
    this._parallel = options.parallel ?? true;
    this._inputMapper = options.inputMapper;
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
    return new Guardrails(
      {
        onFailure: this._onFailure,
        name: this._name,
        runAll: this._runAll,
        parallel: this._parallel,
        inputMapper: this._inputMapper,
        ...overrides,
      },
      this.guards,
    );
  }

  // ── run() — main entry point ─────────────────────────────────────────────

  async run<T>(
    fn: (...args: unknown[]) => Promise<T>,
    ...args: unknown[]
  ): Promise<T> {
    // Capture parent context BEFORE fn() runs.
    // This ensures the guardrail span is a SIBLING of the LLM span, not a child.
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

    const spanName = this._name ? `${this._name}.guardrail` : "guardrail";

    const tracer = getTracer();

    // Create parent guardrail span as a SIBLING of LLM span
    const guardrailSpan = tracer.startSpan(
      spanName,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.RUN,
          [SpanAttributes.GEN_AI_GUARDRAIL_NAME]: this._name,
          [SpanAttributes.GEN_AI_GUARDRAIL_GUARD_COUNT]: this.guards.length,
        },
      },
      parentContext,
    );

    const guardrailContext = trace.setSpan(parentContext, guardrailSpan);
    const startTime = performance.now();

    try {
      const guardResults = await this._executeGuards(
        guardInputs,
        guardNames,
        guardrailContext,
      );

      const duration = performance.now() - startTime;
      const failedResults = guardResults.filter((r) => !r.passed);

      guardrailSpan.setAttributes({
        [SpanAttributes.GEN_AI_GUARDRAIL_STATUS]:
          failedResults.length === 0 ? "PASSED" : "FAILED",
        [SpanAttributes.GEN_AI_GUARDRAIL_DURATION]: Math.round(duration),
        [SpanAttributes.GEN_AI_GUARDRAIL_FAILED_GUARD_COUNT]:
          failedResults.length,
      });

      // All guards passed
      if (failedResults.length === 0) {
        return result;
      }

      // Some guards failed — call on_failure handler
      const guardedResult: GuardedResult = {
        result: result as string | Record<string, unknown>,
        guardInputs,
      };
      const fallback = this._onFailure(guardedResult);
      return (fallback ?? result) as T;
    } catch (err) {
      guardrailSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      guardrailSpan.end();
    }
  }

  // ── validate() — direct validation without wrapping a function ────────────

  async validate(
    guardInputs: Record<string, unknown>[],
  ): Promise<GuardResult[]> {
    const parentContext = context.active();
    const guardNames = this.guards.map((g, i) => g.guardName ?? `guard_${i}`);

    const spanName = this._name ? `${this._name}.guardrail` : "guardrail";

    const tracer = getTracer();
    const guardrailSpan = tracer.startSpan(
      spanName,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.RUN,
          [SpanAttributes.GEN_AI_GUARDRAIL_NAME]: this._name,
          [SpanAttributes.GEN_AI_GUARDRAIL_GUARD_COUNT]: this.guards.length,
        },
      },
      parentContext,
    );

    const guardrailContext = trace.setSpan(parentContext, guardrailSpan);
    const startTime = performance.now();

    try {
      const guardResults = await this._executeGuards(
        guardInputs,
        guardNames,
        guardrailContext,
      );

      const duration = performance.now() - startTime;
      const failedResults = guardResults.filter((r) => !r.passed);

      guardrailSpan.setAttributes({
        [SpanAttributes.GEN_AI_GUARDRAIL_STATUS]:
          failedResults.length === 0 ? "PASSED" : "FAILED",
        [SpanAttributes.GEN_AI_GUARDRAIL_DURATION]: Math.round(duration),
        [SpanAttributes.GEN_AI_GUARDRAIL_FAILED_GUARD_COUNT]:
          failedResults.length,
      });

      return guardResults.map((r) => ({
        name: r.name,
        passed: r.passed,
        duration: r.duration,
      }));
    } catch (err) {
      guardrailSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      guardrailSpan.end();
    }
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
    guard: Guard,
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
    try {
      passed = await context.with(guardContext, () => guard(input));
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
    };
    if (!passed && throwOnFail) {
      throw new FailFastGuardResult(index, name, false, duration);
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
  guards: Guard[],
  options?: GuardOptions,
): (...args: A) => Promise<R> {
  const g = new Guardrails(options ?? {}, guards);
  return (...args: A) =>
    g.run(fn as (...args: unknown[]) => Promise<R>, ...args);
}

// ── Tier 2: validate() — standalone validation ────────────────────────────────

/**
 * Validates a string or object against a set of guards without wrapping a function.
 *
 * @example
 * const result = await validate("LLM response text", [toxicityGuard(), piiGuard()]);
 * if (!result.passed) {
 *   console.log("Failed:", result.results.filter(r => !r.passed));
 * }
 */
export async function validate(
  output: string | Record<string, unknown>,
  guards: Guard[],
  options?: ValidateOptions,
): Promise<ValidateResult> {
  const g = new Guardrails({ runAll: true, ...options }, guards);
  const guardInputs = defaultInputMapper(output, guards.length);
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
  guards: Guard[],
  options?: GuardOptions,
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const g = new Guardrails(options ?? {}, guards);
      return g.run(
        (...innerArgs: unknown[]) => originalMethod.apply(this, innerArgs),
        ...args,
      );
    };

    return descriptor;
  };
}
