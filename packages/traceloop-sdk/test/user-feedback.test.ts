import * as assert from "assert";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import * as traceloop from "../src";

const memoryExporter = new InMemorySpanExporter();

let client: traceloop.TraceloopClient;

describe("UserFeedback", () => {
    let originalFetch: typeof global.fetch;

  before(() => {
    originalFetch = global.fetch;
    client = new traceloop.TraceloopClient({
      appName: "test_user_feedback",
      apiKey: "test-key",
      baseUrl: "https://api.traceloop.com",
    });
  });

  afterEach(() => {
    memoryExporter.reset();
    global.fetch = originalFetch;
  });

  it("should create user feedback annotation", async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
      })) as typeof global.fetch;

    const response = await client.userFeedback.create({
      annotationTask: "sample-annotation-task",
      entity: {
        id: "test-entity-123",
      },
      tags: {
        sentiment: "positive",
        score: 0.95,
        tones: ["happy", "sad"],
      },
    });

    assert.ok(response);
    assert.strictEqual(response.status, 200);
  });

  it("should include correct headers and payload in the request", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: string | undefined;

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedHeaders = init?.headers;
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof global.fetch;

    await client.userFeedback.create({
      annotationTask: "sample-annotation-task",
      entity: {
        id: "test-entity-123",
      },
      tags: {
        sentiment: "positive",
        score: 0.95,
      },
    });

    const parsedBody = JSON.parse(capturedBody!);
    assert.strictEqual(
      capturedUrl,
      "https://api.traceloop.com/v2/annotation-tasks/sample-annotation-task/annotations",
    );
    assert.strictEqual(
      (capturedHeaders as Record<string, string>)["Content-Type"],
      "application/json",
    );
    assert.strictEqual(
      (capturedHeaders as Record<string, string>)["Authorization"],
      "Bearer test-key",
    );
    assert.ok(
      (capturedHeaders as Record<string, string>)["X-Traceloop-SDK-Version"],
    );

    assert.strictEqual(parsedBody.entity_instance_id, "test-entity-123");
    assert.strictEqual(parsedBody.flow, "user_feedback");
    assert.strictEqual(parsedBody.source, "sdk");
    assert.deepStrictEqual(parsedBody.tags, {
      sentiment: "positive",
      score: 0.95,
    });
    assert.deepStrictEqual(parsedBody.actor, {
      type: "service",
      id: "test_user_feedback",
    });
  });

  it("should work with association properties context", async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
      })) as typeof global.fetch;

    await traceloop.withAssociationProperties(
      { entity_id: "test-entity-123" },
      async () => {
        const response = await client.userFeedback.create({
          annotationTask: "sample-annotation-task",
          entity: {
            id: "test-entity-123",
          },
          tags: {
            sentiment: "positive",
            score: 0.95,
          },
        });

        assert.ok(response);
        assert.strictEqual(response.status, 200);
      },
    );
  });
});
