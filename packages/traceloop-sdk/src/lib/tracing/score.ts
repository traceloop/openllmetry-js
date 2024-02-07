import { _configuration } from "../configuration";

export async function reportScore(
  associationProperty: { [name: string]: string },
  score: number,
) {
  if (!_configuration) {
    console.log("Warning: Traceloop not initialized");
    return;
  }

  if (Object.keys(associationProperty).length > 1) {
    throw new Error("Too many association properties");
  }

  if (Object.keys(associationProperty).length < 1) {
    throw new Error("Missing association properties");
  }

  const entityName = Object.keys(associationProperty)[0];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const entityId = associationProperty[entityName!];

  const res = await fetch(`${_configuration.baseUrl}/v1/traceloop/score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${_configuration.apiKey}`,
      "X-Traceloop-SDK-Version": "0.0.30",
    },
    body: JSON.stringify({
      score,
      entity_name: `traceloop.association.properties.${entityName}`,
      entity_id: entityId,
    }),
  });
  console.log(res);
}
