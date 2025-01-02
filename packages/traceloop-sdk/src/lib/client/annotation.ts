import { TraceloopClient } from "./traceloop-client";
import { diag } from "@opentelemetry/api";

type TagValue = string | number | string[];

export class Annotation {
  constructor(private client: TraceloopClient) {}

  /**
   * Creates a new annotation for a specific task and entity.
   *
   * @param annotationTaskId - The ID of the annotation task, Can be found at app.traceloop.com/annotation_tasks/:annotationTaskId
   * @param entityInstanceId - The ID of the entity instance to annotate
   * @param tags - Key-value pairs of annotation data, should match the tags defined in the annotation task
   * @param flow - The type of feedback flow. Defaults to "user_feedback"
   * @returns Promise resolving to the fetch Response
   *
   * @example
   * ```typescript
   * await client.annotation.create('annotationTaskId', 'entityInstanceId', {
   *   sentiment: 'positive',
   *   score: 0.85,
   *   tones: ['happy', 'excited']
   * });
   * ```
   */
  async create(
    annotationTaskId: string,
    entityInstanceId: string,
    tags: { [key: string]: TagValue },
    flow: "user_feedback" | "llm_feedback" = "user_feedback",
  ) {
    const res = await this.client.post(
      `/v2/annotation-tasks/${annotationTaskId}/annotations`,
      {
        entity_instance_id: entityInstanceId,
        tags,
        flow,
      },
    );
    if (!res.ok) {
      diag.error("Failed to create annotation", { status: res.status });
    }
  }
}
