import { diag } from "@opentelemetry/api";
import { GuardedResult, GuardValidationError } from "./model";

export type OnFailureHandler = (output: GuardedResult) => unknown;

/**
 * Built-in failure strategy factories.
 */
export const OnFailure = {
  /** Throw a GuardValidationError (or custom exception). Default behavior. */
  raiseException(message?: string): OnFailureHandler {
    return (output: GuardedResult) => {
      throw new GuardValidationError(
        output,
        message ?? "One or more guards failed validation.",
      );
    };
  },

  /** Log a warning and return the original result unchanged. */
  log(level: string = "warn", message?: string): OnFailureHandler {
    return (output: GuardedResult) => {
      const msg = message ?? "Guardrail failed — returning original result.";
      if (level === "error") {
        diag.error(msg, { result: output.result });
      } else {
        diag.warn(msg, { result: output.result });
      }
      return output.result;
    };
  },

  /** Silently return the original result (shadow/observe mode). */
  noop(): OnFailureHandler {
    return (output: GuardedResult) => output.result;
  },

  /** Return a fixed fallback value instead of the original result. */
  returnValue(value: unknown): OnFailureHandler {
    return (_output: GuardedResult) => value;
  },
} as const;

/**
 * Resolve a string shorthand or callable to an OnFailureHandler.
 *
 * - "raise"  → OnFailure.raiseException()
 * - "log"    → OnFailure.log()
 * - "ignore" / "noop" → OnFailure.noop()
 * - any other string  → OnFailure.returnValue(string)
 * - callable          → used as-is
 */
export function resolveOnFailure(
  value: string | OnFailureHandler,
): OnFailureHandler {
  if (typeof value === "function") {
    return value;
  }

  switch (value) {
    case "raise":
      return OnFailure.raiseException();
    case "log":
      return OnFailure.log();
    case "ignore":
    case "noop":
      return OnFailure.noop();
    default:
      // Any other string becomes a fallback return value
      return OnFailure.returnValue(value);
  }
}
