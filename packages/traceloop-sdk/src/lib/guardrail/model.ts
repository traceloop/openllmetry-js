import { TraceloopError, SEVERITY } from "../errors";

/**
 * Core Guard type — any async function that takes a dict input and returns a boolean.
 * A guard returns true = pass, false = fail.
 */
export type Guard = (input: Record<string, unknown>) => Promise<boolean>;

/**
 * Maps the LLM function output to one guard input per guard.
 * Can return a list (index-matched to guards) or a dict (keyed by guard name).
 */
export type InputMapper = (
  output: unknown,
  numGuards: number,
) => Record<string, unknown>[] | Record<string, Record<string, unknown>>;

/**
 * Passed to on_failure handlers when a guard fails.
 */
export interface GuardedResult {
  result: unknown;
  guardInputs: Record<string, unknown>[];
}

/**
 * The result of a single guard's execution.
 */
export interface GuardResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: Error;
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
