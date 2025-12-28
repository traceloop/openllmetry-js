import { setAssociationProperties } from "../tracing/association";

/**
 * Standard association properties for tracing.
 */
export enum AssociationProperty {
  CUSTOMER_ID = "customer_id",
  USER_ID = "user_id",
  SESSION_ID = "session_id",
}

/**
 * Type alias for a single association tuple.
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
   * traceloop.associations.set([[AssociationProperty.SESSION_ID, "conv-123"]]);
   *
   * // Multiple associations
   * traceloop.associations.set([
   *   [AssociationProperty.USER_ID, "user-456"],
   *   [AssociationProperty.SESSION_ID, "session-789"]
   * ]);
   */
  set(associations: Association[]): void {
    // Convert associations array to a record
    const properties: Record<string, string> = {};
    for (const [prop, value] of associations) {
      properties[prop] = value;
    }

    // Set the association properties in the current context
    setAssociationProperties(properties);
  }
}
