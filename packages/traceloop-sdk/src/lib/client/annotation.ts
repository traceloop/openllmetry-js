import { TraceloopClient } from "./traceloop-client";
import { diag } from "@opentelemetry/api";
import { CreateAnnotationOptions } from "../interfaces/annotations.interface";

export class Annotation {
  constructor(private client: TraceloopClient) {}

  /**
   * Creates a new annotation for a specific task and entity.
   *
   * @param options - The options for creating an annotation
   * @returns Promise resolving to the fetch Response
   *
   * @example
   * ```typescript
   * await client.annotation.create({
   *   annotationTaskIdOrSlug: 'sample-annotation-task',
   *   entityInstanceId: '123456',
   *   tags: {
   *     sentiment: 'positive',
   *     score: 0.85,
   *     tones: ['happy', 'surprised']
   *   }
   * });
   * ```
   */
  async create({
    annotationTask,
    entityInstanceId,
    tags,
  }: CreateAnnotationOptions) {
    const res = await this.client.post(
      `/v2/annotation-tasks/${annotationTask}/annotations`,
      {
        entity_instance_id: entityInstanceId,
        tags,
        source: "sdk",
        flow: "user_feedback",
        actor: {
          type: "service",
          id: this.client.appName,
        },
      },
    );
    if (!res.ok) {
      diag.error("Failed to create annotation", { status: res.status });
    }
  }
}
