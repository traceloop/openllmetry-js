/**
 * Standard association properties for tracing.
 * Use these with withAssociationProperties() or decorator associationProperties config.
 *
 * @example
 * ```typescript
 * // With withAssociationProperties
 * await traceloop.withAssociationProperties(
 *   {
 *     [traceloop.AssociationProperty.USER_ID]: "12345",
 *     [traceloop.AssociationProperty.SESSION_ID]: "session-abc"
 *   },
 *   async () => {
 *     await chat();
 *   }
 * );
 *
 * // With decorator
 * @traceloop.workflow((thisArg) => ({
 *   name: "my_workflow",
 *   associationProperties: {
 *     [traceloop.AssociationProperty.USER_ID]: (thisArg as MyClass).userId,
 *   },
 * }))
 * ```
 */
export enum AssociationProperty {
  CUSTOMER_ID = "customer_id",
  USER_ID = "user_id",
  SESSION_ID = "session_id",
}
