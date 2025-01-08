/**
 * Represents an entity in the system that can be annotated.
 * An entity is typically a unit of content or interaction that needs to be tracked or evaluated.
 * It is reported as an association property before the annotation is created.
 */
export interface Entity {
  /**
   * Unique identifier for the entity.
   * This could be a user ID, conversation ID, or any other unique identifier in your system.
   */
  id: string;
}

/**
 * Configuration options for creating a new annotation.
 * Annotations are used to attach metadata, feedback, or evaluation results to specific entities.
 */
export interface AnnotationCreateOptions {
  /**
   * The identifier of the annotation task.
   * The ID or slug of the annotation task, Can be found at app.traceloop.com/annotation_tasks/:annotationTaskId   */
  annotationTask: string;

  /**
   * The entity to be annotated.
   * Contains the entity's identifier and optional type information.
   * Be sure to report the entity instance ID as the association property before
   * in order to correctly correlate the annotation to the relevant context.
   */
  entity: Entity;

  /**
   * Key-value pairs of annotation data, should match the tags defined in the annotation task
   */
  tags: Record<string, TagValue>;
}

export type TagValue = string | number | string[];