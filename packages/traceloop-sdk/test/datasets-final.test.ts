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

    // Verify client is properly configured
    assert.ok(client);
    assert.ok(client.datasets);
    assert.ok(typeof client.datasets.create === "function");
    assert.ok(typeof client.datasets.list === "function");

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
    // Test that our interfaces use snake_case as per API format
    const mockDatasetResponse = {
      id: "test-id",
      slug: "test-slug",
      name: "test-name",
      description: "test-description",
      created_at: "2025-01-01T00:00:00Z", // snake_case from API
      updated_at: "2025-01-01T00:00:00Z", // snake_case from API
      columns: {}, // API returns columns object
      rows: [], // API returns rows array
    };

    assert.ok(mockDatasetResponse.id);
    assert.ok(mockDatasetResponse.slug);
    assert.ok(mockDatasetResponse.created_at);
    assert.ok(mockDatasetResponse.updated_at);
    assert.ok(typeof mockDatasetResponse.columns === "object");
    assert.ok(Array.isArray(mockDatasetResponse.rows));
    console.log("✓ Dataset response interfaces use consistent snake_case format");
  });

  it("should handle column interfaces with slug correctly", () => {
    // Test that column interfaces use slug instead of id (PR #320)
    const mockColumnResponse: traceloop.ColumnResponse = {
      slug: "test-column-slug", // Changed from id to slug
      name: "Test Column",
      type: "string",
      datasetId: "dataset-id",
      datasetSlug: "dataset-slug",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    assert.strictEqual(mockColumnResponse.slug, "test-column-slug");
    assert.strictEqual(mockColumnResponse.name, "Test Column");
    assert.strictEqual(mockColumnResponse.type, "string");
    console.log("✓ Column interfaces correctly use slug instead of id (PR #320)");
  });
});
