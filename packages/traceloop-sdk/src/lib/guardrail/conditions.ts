export type ConditionValue = string | number | boolean | null | undefined;

/**
 * Predicate factory functions for use as guard conditions.
 * Each returns a (value: ConditionValue) => boolean function.
 */

/** Pass only if value is strictly true (boolean). */
export function isTrue(): (v: ConditionValue) => boolean {
  return (v) => v === true;
}

/** Pass only if value is strictly false (boolean). */
export function isFalse(): (v: ConditionValue) => boolean {
  return (v) => v === false;
}

/** Pass if value is truthy (loose). */
export function isTruthy(): (v: ConditionValue) => boolean {
  return (v) => Boolean(v);
}

/** Pass if value is falsy (loose). */
export function isFalsy(): (v: ConditionValue) => boolean {
  return (v) => !v;
}

/** Pass if value > n. Returns false for non-numbers. */
export function gt(n: number): (v: ConditionValue) => boolean {
  return (v) => typeof v === "number" && v > n;
}

/** Pass if value < n. Returns false for non-numbers. */
export function lt(n: number): (v: ConditionValue) => boolean {
  return (v) => typeof v === "number" && v < n;
}

/** Pass if value >= n. Returns false for non-numbers. */
export function gte(n: number): (v: ConditionValue) => boolean {
  return (v) => typeof v === "number" && v >= n;
}

/** Pass if value <= n. Returns false for non-numbers. */
export function lte(n: number): (v: ConditionValue) => boolean {
  return (v) => typeof v === "number" && v <= n;
}

/** Pass if min <= value <= max (inclusive). Returns false for non-numbers. */
export function between(
  min: number,
  max: number,
): (v: ConditionValue) => boolean {
  return (v) => typeof v === "number" && v >= min && v <= max;
}

/** Pass if value === expected (strict equality). */
export function eq(expected: ConditionValue): (v: ConditionValue) => boolean {
  return (v) => v === expected;
}
