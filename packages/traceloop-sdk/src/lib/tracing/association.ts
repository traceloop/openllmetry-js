import { context } from "@opentelemetry/api";
import { ASSOCATION_PROPERTIES_KEY } from "./tracing";

/**
 * Execute a function with association properties that will be added to all spans
 * created within the function's execution context.
 *
 * Uses OpenTelemetry context propagation to flow properties to child spans.
 *
 * @param properties - A record of association properties to set
 * @param fn - The function to execute with the association properties
 * @param thisArg - Optional this context for the function
 * @param args - Arguments to pass to the function
 *
 * @example
 * ```typescript
 * import * as traceloop from "@traceloop/node-server-sdk";
 *
 * await traceloop.withAssociationProperties(
 *   {
 *     [traceloop.AssociationProperty.USER_ID]: "12345",
 *     [traceloop.AssociationProperty.SESSION_ID]: "session-abc"
 *   },
 *   async () => {
 *     await chat();
 *   }
 * );
 * ```
 */
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
