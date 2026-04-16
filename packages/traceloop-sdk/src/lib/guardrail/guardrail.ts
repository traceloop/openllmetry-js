import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_EVALUATION_NAME,
  ATTR_GEN_AI_EVALUATION_SCORE_LABEL,
} from "@opentelemetry/semantic-conventions/incubating";
import { getTracer } from "../tracing/tracing";
import { defaultInputMapper, resolveGuardInputs } from "./default-mapper";
import {
  Guard,
  GuardedResult,
  GuardExecutionError,
  GuardResult,
  InputMapper,
} from "./model";
import { OnFailureHandler, resolveOnFailure } from "./on-failure";
import { GuardrailOperationNames, GuardrailSpanAttributes } from "./span-attributes";

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
  onFailure?: string | OnFailureHandler;
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
  error?: Error;
}

// ── Guardrails class (Tier 3) ────────────────────────────────────────────────

export class Guardrails {
  private readonly guards: Guard[];
  private readonly _onFailure: OnFailureHandler;
  private readonly _name: string;
  private readonly _runAll: boolean;
  private readonly _parallel: boolean;
  private readonly _inputMapper?: InputMapper;

  constructor(...args: (Guard | GuardrailsOptions)[]) {
    const guards: Guard[] = [];
    let options: GuardrailsOptions = {};

    for (const arg of args) {
      if (typeof arg === "function") {
        guards.push(arg as Guard);
      } else if (arg !== null && typeof arg === "object") {
        options = arg as GuardrailsOptions;
      }
    }

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
      ...this.guards,
      {
        onFailure: this._onFailure,
        name: this._name,
        runAll: this._runAll,
        parallel: this._parallel,
        inputMapper: this._inputMapper,
        ...overrides,
      },
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

    const guardNames = this.guards.map(
      (g, i) => (g as any).guardName ?? `guard_${i}`,
    );

    const guardInputs = resolveGuardInputs(
      result,
      this.guards.length,
      guardNames,
      this._inputMapper,
    );

    const spanName = this._name
      ? `${this._name}.guardrail`
      : "guardrail";

    const tracer = getTracer();

    // Create parent guardrail span as a SIBLING of LLM span
    const guardrailSpan = tracer.startSpan(
      spanName,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.RUN,
          [GuardrailSpanAttributes.NAME]: this._name,
          [GuardrailSpanAttributes.GUARD_COUNT]: this.guards.length,
        },
      },
      parentContext,
    );

    const guardrailContext = trace.setSpan(parentContext, guardrailSpan);
    const startTime = performance.now();

    try {
      const guardResults = await this._executeGuards(guardInputs, guardNames, guardrailContext);

      const duration = performance.now() - startTime;
      const failedResults = guardResults.filter((r) => !r.passed);
      const executionErrors = guardResults.filter((r) => r.error);

      guardrailSpan.setAttributes({
        [GuardrailSpanAttributes.STATUS]: failedResults.length === 0 ? "PASSED" : "FAILED",
        [GuardrailSpanAttributes.DURATION]: Math.round(duration),
        [GuardrailSpanAttributes.FAILED_GUARD_COUNT]: failedResults.length,
      });

      guardrailSpan.end();

      // Guard threw an unexpected exception
      if (executionErrors.length > 0) {
        const first = executionErrors[0];
        throw new GuardExecutionError(
          first.error!,
          guardInputs[first.index],
          first.index,
        );
      }

      // All guards passed
      if (failedResults.length === 0) {
        return result;
      }

      // Some guards failed — call on_failure handler
      const guardedResult: GuardedResult = { result, guardInputs };
      return this._onFailure(guardedResult) as T;
    } catch (err) {
      guardrailSpan.setStatus({ code: SpanStatusCode.ERROR });
      guardrailSpan.end();
      throw err;
    }
  }

  // ── validate() — direct validation without wrapping a function ────────────

  async validate(
    guardInputs: Record<string, unknown>[],
    onFailure?: string | OnFailureHandler,
  ): Promise<boolean> {
    const parentContext = context.active();
    const guardNames = this.guards.map(
      (g, i) => (g as any).guardName ?? `guard_${i}`,
    );

    const spanName = this._name
      ? `${this._name}.guardrail`
      : "guardrail";

    const tracer = getTracer();
    const guardrailSpan = tracer.startSpan(
      spanName,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.RUN,
          [GuardrailSpanAttributes.NAME]: this._name,
          [GuardrailSpanAttributes.GUARD_COUNT]: this.guards.length,
        },
      },
      parentContext,
    );

    const guardrailContext = trace.setSpan(parentContext, guardrailSpan);
    const startTime = performance.now();

    try {
      const guardResults = await this._executeGuards(guardInputs, guardNames, guardrailContext);

      const duration = performance.now() - startTime;
      const failedResults = guardResults.filter((r) => !r.passed);

      guardrailSpan.setAttributes({
        [GuardrailSpanAttributes.STATUS]: failedResults.length === 0 ? "PASSED" : "FAILED",
        [GuardrailSpanAttributes.DURATION]: Math.round(duration),
        [GuardrailSpanAttributes.FAILED_GUARD_COUNT]: failedResults.length,
      });

      guardrailSpan.end();
      return failedResults.length === 0;
    } catch (err) {
      guardrailSpan.setStatus({ code: SpanStatusCode.ERROR });
      guardrailSpan.end();
      throw err;
    }
  }

  // ── Internal guard execution ─────────────────────────────────────────────

  private async _executeGuards(
    guardInputs: Record<string, unknown>[],
    guardNames: string[],
    parentContext: ReturnType<typeof trace.setSpan>,
  ): Promise<GuardExecutionResult[]> {
    if (this._parallel) {
      // Run all guards concurrently
      const promises = this.guards.map((guard, i) =>
        this._runSingleGuard(guard, guardInputs[i], guardNames[i], i, parentContext),
      );

      if (this._runAll) {
        // Collect ALL results even if some fail
        const settled = await Promise.allSettled(promises);
        return settled.map((s, i) =>
          s.status === "fulfilled"
            ? s.value
            : {
                index: i,
                name: guardNames[i],
                passed: false,
                duration: 0,
                error: s.reason instanceof Error ? s.reason : new Error(String(s.reason)),
              },
        );
      } else {
        // Fail-fast — Promise.all rejects on first rejection
        return Promise.all(promises);
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
  ): Promise<GuardExecutionResult> {
    const tracer = getTracer();

    const guardSpan = tracer.startSpan(
      `${name}.guard`,
      {
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: GuardrailOperationNames.GUARD,
          [GuardrailSpanAttributes.NAME]: name,
          [ATTR_GEN_AI_EVALUATION_NAME]: name,
          [GuardrailSpanAttributes.INPUT]: JSON.stringify(input),
        },
      },
      parentContext,
    );

    const guardContext = trace.setSpan(parentContext, guardSpan);
    const startTime = performance.now();

    try {
      const passed = await context.with(guardContext, () => guard(input));
      const duration = performance.now() - startTime;

      guardSpan.setAttributes({
        [GuardrailSpanAttributes.STATUS]: passed ? "PASSED" : "FAILED",
        [ATTR_GEN_AI_EVALUATION_SCORE_LABEL]: passed ? "PASSED" : "FAILED",
        [GuardrailSpanAttributes.DURATION]: Math.round(duration),
      });
      guardSpan.end();

      return { index, name, passed, duration };
    } catch (error) {
      const duration = performance.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      guardSpan.setAttributes({
        [GuardrailSpanAttributes.STATUS]: "FAILED",
        [GuardrailSpanAttributes.DURATION]: Math.round(duration),
        [GuardrailSpanAttributes.ERROR_TYPE]: err.constructor.name,
        [GuardrailSpanAttributes.ERROR_MESSAGE]: err.message,
      });
      guardSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      guardSpan.recordException(err);
      guardSpan.end();

      return { index, name, passed: false, duration, error: err };
    }
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
  const g = new Guardrails(...guards, options ?? {});
  return (...args: A) => g.run(fn as (...args: unknown[]) => Promise<R>, ...args);
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
  const g = new Guardrails(...guards, options ?? {});
  const guardInputs = defaultInputMapper(output, guards.length);
  // Delegates to Guardrails.validate() which handles spans internally
  const passed = await g.validate(guardInputs, options?.onFailure);
  return { passed, results: [] };
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
      const g = new Guardrails(...guards, options ?? {});
      return g.run(
        (...innerArgs: unknown[]) => originalMethod.apply(this, innerArgs),
        ...args,
      );
    };

    return descriptor;
  };
}
