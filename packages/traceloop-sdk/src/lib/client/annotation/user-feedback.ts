import { BaseAnnotation } from "./base-annotation";
import { TraceloopClient } from "../traceloop-client";
import { AnnotationCreateOptions } from "../../interfaces/annotations.interface";

/**
 * Handles user feedback annotations with the Traceloop API.
 */
export class UserFeedback extends BaseAnnotation {
  constructor(client: TraceloopClient) {
    super(client, "user_feedback");
  }

  /**
   * Creates a new annotation for a specific task and entity.
   *
   * @param options - The options for creating an annotation
   * @returns Promise resolving to the fetch Response
   *
   * @example
   * ```typescript
   * await client.annotation.create({
   *   annotationTask: 'sample-annotation-task',
   *   entity: {
   *     id: '123456',
   *   },
   *   tags: {
   *     sentiment: 'positive',
   *     score: 0.85,
   *     tones: ['happy', 'surprised']
   *   }
   * });
   * ```
   */
  override async create(options: AnnotationCreateOptions) {
    return await super.create(options);
  }
}
