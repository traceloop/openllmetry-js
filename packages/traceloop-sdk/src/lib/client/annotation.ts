import { TraceloopClient } from "./traceloop-client";
import { diag } from "@opentelemetry/api";

export class Annotation {
  constructor(private client: TraceloopClient) {}

  async create(
    annotationTaskId: string,
    entityInstanceId: string,
    tags: { [key: string]: any },
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
