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

  const newContext = context
    .active()
    .setValue(ASSOCATION_PROPERTIES_KEY, properties);
  return context.with(newContext, fn, thisArg, ...args);
}
