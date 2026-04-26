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

function toNum(v: ConditionValue): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

/** Pass if value > n. Returns false for null/undefined/NaN. */
export function gt(n: number): (v: ConditionValue) => boolean {
  return (v) => {
    const num = toNum(v);
    return num !== null && num > n;
  };
}

/** Pass if value < n. Returns false for null/undefined/NaN. */
export function lt(n: number): (v: ConditionValue) => boolean {
  return (v) => {
    const num = toNum(v);
    return num !== null && num < n;
  };
}

/** Pass if value >= n. Returns false for null/undefined/NaN. */
export function gte(n: number): (v: ConditionValue) => boolean {
  return (v) => {
    const num = toNum(v);
    return num !== null && num >= n;
  };
}

/** Pass if value <= n. Returns false for null/undefined/NaN. */
export function lte(n: number): (v: ConditionValue) => boolean {
  return (v) => {
    const num = toNum(v);
    return num !== null && num <= n;
  };
}

/** Pass if min <= value <= max (inclusive). Returns false for null/undefined/NaN. */
export function between(
  min: number,
  max: number,
): (v: ConditionValue) => boolean {
  return (v) => {
    const num = toNum(v);
    return num !== null && num >= min && num <= max;
  };
}

/** Pass if value === expected (strict equality). */
export function eq(expected: ConditionValue): (v: ConditionValue) => boolean {
  return (v) => v === expected;
}
