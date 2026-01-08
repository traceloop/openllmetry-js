import { context, trace } from "@opentelemetry/api";
import { ASSOCATION_PROPERTIES_KEY } from "./tracing";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

// Store association properties by span ID to enable propagation to child spans
const spanAssociationProperties = new Map<
  string,
  { properties: { [name: string]: string }; timestamp: number }
>();

const SPAN_ASSOCIATION_PROPERTIES_TTL = 5 * 60 * 1000; // 5 minutes

export function getSpanAssociationProperties(
  spanId: string,
): { [name: string]: string } | undefined {
  return spanAssociationProperties.get(spanId)?.properties;
}

export function setSpanAssociationPropertiesForInheritance(
  spanId: string,
  properties: { [name: string]: string },
): void {
  spanAssociationProperties.set(spanId, {
    properties,
    timestamp: Date.now(),
  });
}

export function cleanupExpiredSpanAssociationProperties(): void {
  const now = Date.now();
  for (const [spanId, entry] of spanAssociationProperties.entries()) {
    if (now - entry.timestamp > SPAN_ASSOCIATION_PROPERTIES_TTL) {
      spanAssociationProperties.delete(spanId);
    }
  }
}

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

/**
 * Set association properties that will be added to the current and all child spans.
 * This function should be called within an active span context (e.g., within a workflow or task).
 *
 * @param properties - A record of association properties to set
 */
export function setAssociationProperties(properties: {
  [name: string]: string;
}): void {
  if (Object.keys(properties).length === 0) {
    return;
  }

  // Get the current span
  const span = trace.getActiveSpan();
  if (span) {
    const spanId = span.spanContext().spanId;

    // Get existing properties for this span and merge with new ones
    const existingEntry = spanAssociationProperties.get(spanId);
    const mergedProperties = {
      ...existingEntry?.properties,
      ...properties,
    };

    // Store the merged properties so child spans can inherit them
    spanAssociationProperties.set(spanId, {
      properties: mergedProperties,
      timestamp: Date.now(),
    });

    // Set attributes on the current span
    for (const [key, value] of Object.entries(properties)) {
      span.setAttribute(
        `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.${key}`,
        value,
      );
    }
  }
}
