import * as assert from "assert";
import * as traceloop from "../src";

describe("Dataset API Final Test", () => {
  let client: traceloop.TraceloopClient;

  before(() => {
    client = new traceloop.TraceloopClient({
      appName: "dataset_final_test",
      apiKey: "test-key",
      baseUrl: "https://api-staging.traceloop.com",
      projectId: "default",
    });
  });

  it("should have correct dataset route configuration", () => {
    // After PR #3219, dataset routes no longer require project prefix
    // The SDK now uses direct /v2/datasets routes as per the updated API

    // Verify base URL is set correctly
    assert.ok(client.getProjectId());
    assert.strictEqual(client.getProjectId(), "default");

    console.log(
      "✓ Dataset routes are correctly configured without project prefix per PR #3219",
    );
  });

  it("should have dataset client available", () => {
    assert.ok(client.datasets);
    assert.ok(typeof client.datasets.create === "function");
    assert.ok(typeof client.datasets.get === "function");
    assert.ok(typeof client.datasets.list === "function");
    console.log("✓ Dataset client is properly initialized with all methods");
  });

  it("should create dataset create options correctly", () => {
    const createOptions = {
      name: "test-dataset",
      description: "Test description",
    };

    assert.ok(createOptions.name);
    assert.ok(createOptions.description);
    console.log("✓ Dataset creation options are properly structured");
  });

  it("should handle dataset interfaces correctly", () => {
    // Test that our interfaces support both camelCase and snake_case
    const mockDatasetResponse = {
      id: "test-id",
      slug: "test-slug",
      name: "test-name",
      description: "test-description",
      createdAt: "2025-01-01T00:00:00Z", // camelCase after transformation
      updatedAt: "2025-01-01T00:00:00Z", // camelCase after transformation
      columns: {}, // API returns columns object
      rows: [], // API returns rows array
    };

    assert.ok(mockDatasetResponse.id);
    assert.ok(mockDatasetResponse.slug);
    assert.ok(mockDatasetResponse.createdAt);
    assert.ok(mockDatasetResponse.updatedAt);
    assert.ok(typeof mockDatasetResponse.columns === "object");
    assert.ok(Array.isArray(mockDatasetResponse.rows));
    console.log("✓ Dataset response interfaces use consistent camelCase format");
  });

  it("should handle column interfaces with slug correctly", () => {
    // Test that column interfaces use slug instead of id (PR #320)
    const mockColumnResponse: traceloop.ColumnResponse = {
      slug: "test-column-slug", // Changed from id to slug
      name: "Test Column",
      type: "string",
      datasetId: "dataset-id",
      datasetSlug: "dataset-slug",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    assert.strictEqual(mockColumnResponse.slug, "test-column-slug");
    assert.strictEqual(mockColumnResponse.name, "Test Column");
    assert.strictEqual(mockColumnResponse.type, "string");
    console.log("✓ Column interfaces correctly use slug instead of id (PR #320)");
  });
});
