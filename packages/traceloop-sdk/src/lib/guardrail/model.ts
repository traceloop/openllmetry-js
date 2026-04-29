import { TraceloopError, SEVERITY } from "../errors";

/**
 * Core Guard type — any async function that takes a dict input and returns a boolean
 * or a GuardCallResult (pre-built guards return the raw API response alongside the bool).
 *
 * TInput declares the shape of the input dict this guard expects.
 * Defaults to Record<string, unknown> (untyped) for simple guards and custom guards.
 * Complex pre-built guards (e.g. semanticSimilarityGuard) use a specific TInput so
 * TypeScript can enforce that a matching inputMapper is provided at the call site.
 */
export type Guard<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> = ((input: TInput) => Promise<boolean | GuardCallResult>) & {
  guardName?: string;
};

/**
 * Maps the LLM function output to one guard input per guard.
 * Can return a list (index-matched to guards) or a dict (keyed by guard name).
 *
 * TOutput — the type of the LLM output being mapped (defaults to string | object).
 * TInput  — the shape each guard expects as input (defaults to Record<string, unknown>).
 */
export type InputMapper<
  TOutput extends string | Record<string, unknown> =
    | string
    | Record<string, unknown>,
  TInput extends Record<string, unknown> = Record<string, unknown>,
> = (output: TOutput, numGuards: number) => TInput[] | Record<string, TInput>;

// ── Named input types for complex pre-built guards ───────────────────────────
// Using `type` (not `interface`) so they satisfy `extends Record<string, unknown>`
// and rollup-plugin-dts preserves them as named types in the bundled .d.ts.

/** Input required by semanticSimilarityGuard. */
export type SemanticSimilarityInput = { text: string; reference: string };

/** Input required by instructionAdherenceGuard. */
export type InstructionAdherenceInput = {
  instructions: string;
  response: string;
};

/** Input required by uncertaintyGuard. */
export type UncertaintyInput = { prompt: string; completion: string };

// ── Core result/handler types ────────────────────────────────────────────────

/**
 * Passed to on_failure handlers when a guard fails.
 */
export interface GuardedResult {
  result: string | Record<string, unknown>;
  guardInputs: Record<string, unknown>[];
}

/**
 * The result of a single guard's execution.
 */
export interface GuardResult {
  name: string;
  passed: boolean;
  duration: number;
  /** Raw API response fields, e.g. { similarity_score: 0.12 } or { is_safe: false }. */
  output?: Record<string, unknown>;
}

/**
 * Internal return type for pre-built guards that want to carry the raw API
 * response alongside the pass/fail boolean. Custom user guards still return
 * plain `boolean` — _runSingleGuard accepts both via a union check.
 */
export interface GuardCallResult {
  passed: boolean;
  output: Record<string, unknown>;
}

// ── Internal: used by parallel failFast to carry a failed GuardExecutionResult
// through Promise.all rejection without losing span/timing data.

export class FailFastGuardResult {
  constructor(
    public readonly index: number,
    public readonly name: string,
    public readonly passed: false,
    public readonly duration: number,
    public readonly output?: Record<string, unknown>,
  ) {}
}

// ── Error hierarchy ──────────────────────────────────────────────────────────

export class GuardrailError extends TraceloopError {
  constructor(message: string) {
    super(message, SEVERITY.Error);
    this.name = "GuardrailError";
  }
}

export class GuardValidationError extends GuardrailError {
  output: GuardedResult;

  constructor(output: GuardedResult, message?: string) {
    super(message ?? "One or more guards failed validation.");
    this.name = "GuardValidationError";
    this.output = output;
  }
}

export class GuardExecutionError extends GuardrailError {
  originalException: Error;
  guardInput: Record<string, unknown>;
  guardIndex: number;

  constructor(
    originalException: Error,
    guardInput: Record<string, unknown>,
    guardIndex: number,
  ) {
    super(
      `Guard at index ${guardIndex} threw an exception: ${originalException.message}`,
    );
    this.name = "GuardExecutionError";
    this.originalException = originalException;
    this.underlyingCause = originalException;
    this.guardInput = guardInput;
    this.guardIndex = guardIndex;
  }
}

export class GuardInputTypeError extends GuardrailError {
  guardIndex: number;
  expectedType: string;
  actualType: string;

  constructor(guardIndex: number, expectedType: string, actualType: string) {
    super(
      `Guard at index ${guardIndex} expected input of type "${expectedType}" but got "${actualType}".`,
    );
    this.name = "GuardInputTypeError";
    this.guardIndex = guardIndex;
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}
