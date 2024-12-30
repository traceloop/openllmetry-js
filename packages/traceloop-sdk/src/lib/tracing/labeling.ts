import { _configuration } from "../configuration";
import { diag } from "@opentelemetry/api";
import { version } from "../../../package.json";

/**
 * Report labeling data to Traceloop.
 *
 * @param labelingCollectionId - The ID of the labeling collection to report to,
 * should be taken from app.traceloop.com/labeling/:labeling_collection_id
 * @param entityInstanceId - The ID of the specific entity instance being labeled
 * @param tags - Dictionary containing the tags to be reported
 * @param flow - The flow of the labeling, should be either "user_feedback" or "llm_feedback"
 *
 * @example
 * ```typescript
 * reportLabeling(
 *   "collection_123",
 *   "instance_456",
 *   { sentiment: "positive", relevance: 0.95, tones: ["happy", "nice"] },
 *   "user_feedback"
 * );
 * ```
 */
export async function reportLabeling(
  labelingCollectionId: string,
  entityInstanceId: string,
  tags: { [key: string]: any },
  flow: "user_feedback" | "llm_feedback" = "user_feedback",
) {
  if (!_configuration) {
    diag.warn("Traceloop not initialized");
    return;
  }

  const res = await fetch(
    `${_configuration.baseUrl}/v2/labeling-collections/${labelingCollectionId}/labelings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${_configuration.apiKey}`,
        "X-Traceloop-SDK-Version": version,
      },
      body: JSON.stringify({
        labeling_collection_id: labelingCollectionId,
        entity_instance_id: entityInstanceId,
        tags,
        source: "sdk",
        flow,
        actor: {
          type: "service",
          id: _configuration.appName,
        },
      }),
    },
  );

  if (!res.ok) {
    diag.error("Failed to report labeling", { status: res.status });
  }
}
