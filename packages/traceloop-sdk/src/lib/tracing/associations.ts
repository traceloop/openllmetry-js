import { trace, context as otelContext } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { ASSOCATION_PROPERTIES_KEY } from "./tracing";

/**
 * Standard association properties for tracing.
 */
export enum AssociationProperty {
  CONVERSATION_ID = "conversation_id",
  CUSTOMER_ID = "customer_id",
  USER_ID = "user_id",
  SESSION_ID = "session_id",
}

/**
 * Set of standard association property keys (without prefix).
 * Use this to check if a property should be set directly or with the TRACELOOP_ASSOCIATION_PROPERTIES prefix.
 */
export const STANDARD_ASSOCIATION_PROPERTIES = new Set<string>(
  Object.values(AssociationProperty)
);

/**
 * Type alias for a single association
 */
export type Association = [AssociationProperty, string];

/**
 * Class for managing trace associations.
 */
export class Associations {
  /**
   * Set associations that will be added directly to all spans in the current context.
   *
   * @param associations - An array of [property, value] tuples
   *
   * @example
   * // Single association
   * Associations.set([[AssociationProperty.CONVERSATION_ID, "conv-123"]]);
   *
   * // Multiple associations
   * Associations.set([
   *   [AssociationProperty.USER_ID, "user-456"],
   *   [AssociationProperty.SESSION_ID, "session-789"]
   * ]);
   */
  static set(associations: Association[]): void {
    // Get current associations from context or create empty object
    const existingAssociations = otelContext
      .active()
      .getValue(ASSOCATION_PROPERTIES_KEY) as Record<string, string> | undefined;
    const currentAssociations: Record<string, string> = existingAssociations
      ? { ...existingAssociations }
      : {};

    // Update associations with new values
    for (const [prop, value] of associations) {
      currentAssociations[prop] = value;
    }

    // Store associations in context
    const newContext = otelContext
      .active()
      .setValue(ASSOCATION_PROPERTIES_KEY, currentAssociations);

    // Set the new context as active using the context manager
    // This is the equivalent of Python's attach(set_value(...))
    const contextManager = (otelContext as any)['_getContextManager']();
    if (
      contextManager &&
      contextManager instanceof AsyncLocalStorageContextManager
    ) {
      // For AsyncLocalStorageContextManager, we need to use the internal _asyncLocalStorage
      const storage = (contextManager as any)._asyncLocalStorage;
      if (storage) {
        storage.enterWith(newContext);
      }
    }

    // Also set directly on the current span
    const span = trace.getSpan(otelContext.active());
    if (span && span.isRecording()) {
      for (const [prop, value] of associations) {
        span.setAttribute(prop, value);
      }
    }
  }
}
