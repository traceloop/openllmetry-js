import { TraceloopClient } from "../traceloop-client";
import { AnnotationCreateOptions } from "../../interfaces/annotations.interface";

export type AnnotationFlow = "user_feedback";

/**
 * Base class for handling annotation operations with the Traceloop API.
 * @internal
 */
export class BaseAnnotation {
  constructor(
    protected client: TraceloopClient,
    protected flow: AnnotationFlow,
  ) {}

  /**
   * Creates a new annotation.
   *
   * @param options - The annotation creation options
   * @returns Promise resolving to the fetch Response
   */
  async create(options: AnnotationCreateOptions) {
    return await this.client.post(
      `/v2/annotation-tasks/${options.annotationTask}/annotations`,
      {
        entity_instance_id: options.entity.id,
        tags: options.tags,
        source: "sdk",
        flow: this.flow,
        actor: {
          type: "service",
          id: this.client.appName,
        },
      },
    );
  }
}
