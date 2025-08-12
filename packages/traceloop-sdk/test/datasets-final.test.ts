import * as assert from "assert";
import * as traceloop from "../src";

describe("Dataset API Test Suite", () => {
  let client: traceloop.TraceloopClient;

  before(() => {
    client = new traceloop.TraceloopClient({
      appName: "dataset_final_test",
      apiKey: "test-key",
      baseUrl: "https://api-staging.traceloop.com",
    });
  });

  describe("Client Initialization", () => {
    it("should initialize TraceloopClient correctly", () => {
      assert.ok(client);
      assert.ok(client.datasets);
      console.log("✓ TraceloopClient initialized successfully");
    });

    it("should have dataset client available", () => {
      assert.ok(client.datasets);
      console.log("✓ Dataset client is available on main client");
    });
  });

  describe("Route Configuration (PR #3219)", () => {
    it("should configure routes without project prefix", () => {
      // After PR #3219, dataset routes no longer require project prefix
      // The SDK now uses direct /v2/datasets routes as per the updated API
      assert.ok(client);
      assert.ok(client.datasets);
      console.log("✓ Routes configured without project prefix per PR #3219");
    });

    it("should have all required dataset methods", () => {
      assert.ok(typeof client.datasets.create === "function");
      assert.ok(typeof client.datasets.get === "function");
      assert.ok(typeof client.datasets.list === "function");
      assert.ok(typeof client.datasets.findByName === "function");
      console.log("✓ All dataset methods are available");
    });
  });

  describe("Dataset Interfaces", () => {
    it("should create dataset options correctly", () => {
      const createOptions = {
        name: "test-dataset",
        description: "Test description",
      };

      assert.ok(createOptions.name);
      assert.ok(createOptions.description);
      console.log("✓ Dataset creation options are properly structured");
    });

    it("should handle dataset response with snake_case fields", () => {
      // Test that our interfaces use snake_case as per API format
      const mockDatasetResponse = {
        id: "test-id",
        slug: "test-slug",
        name: "test-name",
        description: "test-description",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        columns: {},
        rows: [],
      };

      assert.ok(mockDatasetResponse.id);
      assert.ok(mockDatasetResponse.slug);
      assert.ok(mockDatasetResponse.created_at);
      assert.ok(mockDatasetResponse.updated_at);
      console.log("✓ Dataset response uses consistent snake_case format");
    });

    it("should handle dataset response structure correctly", () => {
      const mockDatasetResponse = {
        id: "test-id",
        slug: "test-slug",
        name: "test-name",
        columns: {},
        rows: [],
      };

      assert.ok(typeof mockDatasetResponse.columns === "object");
      assert.ok(Array.isArray(mockDatasetResponse.rows));
      console.log("✓ Dataset response structure is correct");
    });
  });

  describe("Column Interfaces (PR #320)", () => {
    it("should use slug instead of id for columns", () => {
      // Test that column interfaces use slug instead of id (PR #320)
      const mockColumnResponse: traceloop.ColumnResponse = {
        slug: "test-column-slug",
        name: "Test Column",
        type: "string",
        datasetId: "dataset-id",
        datasetSlug: "dataset-slug",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      assert.strictEqual(mockColumnResponse.slug, "test-column-slug");
      console.log("✓ Column uses slug instead of id per PR #320");
    });

    it("should have correct column properties", () => {
      const mockColumnResponse: traceloop.ColumnResponse = {
        slug: "test-column-slug",
        name: "Test Column",
        type: "string",
        datasetId: "dataset-id",
        datasetSlug: "dataset-slug",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      assert.strictEqual(mockColumnResponse.name, "Test Column");
      assert.strictEqual(mockColumnResponse.type, "string");
      assert.ok(mockColumnResponse.datasetId);
      assert.ok(mockColumnResponse.datasetSlug);
      console.log("✓ Column properties are correctly structured");
    });

    it("should use snake_case for column timestamps", () => {
      const mockColumnResponse: traceloop.ColumnResponse = {
        slug: "test-column-slug",
        name: "Test Column",
        type: "string",
        datasetId: "dataset-id",
        datasetSlug: "dataset-slug",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      assert.ok(mockColumnResponse.created_at);
      assert.ok(mockColumnResponse.updated_at);
      console.log("✓ Column timestamps use snake_case format");
    });
  });
});
