/**
 * Predicate factory functions for use as guard conditions.
 * Each returns a (value: unknown) => boolean function.
 */

/** Pass only if value is strictly true (boolean). */
export function isTrue(): (v: unknown) => boolean {
  return (v) => v === true;
}

/** Pass only if value is strictly false (boolean). */
export function isFalse(): (v: unknown) => boolean {
  return (v) => v === false;
}

/** Pass if value is truthy (loose). */
export function isTruthy(): (v: unknown) => boolean {
  return (v) => Boolean(v);
}

/** Pass if value is falsy (loose). */
export function isFalsy(): (v: unknown) => boolean {
  return (v) => !Boolean(v);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

/** Pass if value > n. Returns false for null/undefined/NaN. */
export function gt(n: number): (v: unknown) => boolean {
  return (v) => { const num = toNum(v); return num !== null && num > n; };
}

/** Pass if value < n. Returns false for null/undefined/NaN. */
export function lt(n: number): (v: unknown) => boolean {
  return (v) => { const num = toNum(v); return num !== null && num < n; };
}

/** Pass if value >= n. Returns false for null/undefined/NaN. */
export function gte(n: number): (v: unknown) => boolean {
  return (v) => { const num = toNum(v); return num !== null && num >= n; };
}

/** Pass if value <= n. Returns false for null/undefined/NaN. */
export function lte(n: number): (v: unknown) => boolean {
  return (v) => { const num = toNum(v); return num !== null && num <= n; };
}

/** Pass if min <= value <= max (inclusive). Returns false for null/undefined/NaN. */
export function between(min: number, max: number): (v: unknown) => boolean {
  return (v) => { const num = toNum(v); return num !== null && num >= min && num <= max; };
}

/** Pass if value === expected (strict equality). Works for any type. */
export function eq(expected: unknown): (v: unknown) => boolean {
  return (v) => v === expected;
}
