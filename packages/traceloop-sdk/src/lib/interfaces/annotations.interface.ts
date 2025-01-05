export interface CreateAnnotationOptions {
  /**
   * The ID or slug of the annotation task, Can be found at app.traceloop.com/annotation_tasks/:annotationTaskId
   */
  annotationTask: string;
  /**
   * The ID of the entity instance to annotate.
   * Be sure to report the entity instance ID as the association property before
   * in order to correctly correlate the annotation to the relevant context.
   */
  entityInstanceId: string;
  /**
   * Key-value pairs of annotation data, should match the tags defined in the annotation task
   */
  tags: { [key: string]: TagValue };
}

export type TagValue = string | number | string[];
