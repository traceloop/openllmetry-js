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
  const newContext = context
    .active()
    .setValue(ASSOCATION_PROPERTIES_KEY, properties);
  return context.with(newContext, fn, thisArg, ...args);
}
