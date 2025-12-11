import { context } from "@opentelemetry/api";
import { ASSOCATION_PROPERTIES_KEY } from "./tracing";

export function withAssociationProperties<
  A extends unknown[],
  F extends (...args: A) => ReturnType<F>,
>(
  properties: { [name: string]: string },
  fn: F,
  thisArg?: ThisParameterType<F>,
  ...args: A
) {
  if (Object.keys(properties).length === 0) {
    return fn.apply(thisArg, args);
  }

  // Get existing associations from context and merge with new properties
  const existingAssociations = context
    .active()
    .getValue(ASSOCATION_PROPERTIES_KEY) as Record<string, string> | undefined;
  const mergedAssociations = existingAssociations
    ? { ...existingAssociations, ...properties }
    : properties;

  const newContext = context
    .active()
    .setValue(ASSOCATION_PROPERTIES_KEY, mergedAssociations);
  return context.with(newContext, fn, thisArg, ...args);
}
