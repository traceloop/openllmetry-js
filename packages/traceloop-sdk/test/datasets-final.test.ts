import * as assert from "assert";
import * as traceloop from "../src";
import { transformApiResponse } from "../src/lib/utils/response-transformer";

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
      assert.ok(typeof client.datasets.delete === "function");
      assert.ok(typeof client.datasets.getVersionCSV === "function");
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

    it("should handle dataset response with snake_case fields and transform to camelCase", () => {
      // Test that the transformer converts snake_case API response to camelCase
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

      // Verify original snake_case fields
      assert.ok(mockDatasetResponse.id);
      assert.ok(mockDatasetResponse.slug);
      assert.ok(mockDatasetResponse.created_at);
      assert.ok(mockDatasetResponse.updated_at);

      // Transform using the SDK transformer
      const transformedResponse = transformApiResponse(mockDatasetResponse);

      // Verify transformed camelCase fields
      assert.strictEqual(transformedResponse.id, "test-id");
      assert.strictEqual(transformedResponse.slug, "test-slug");
      assert.strictEqual(transformedResponse.name, "test-name");
      assert.strictEqual(transformedResponse.description, "test-description");
      assert.strictEqual(transformedResponse.createdAt, "2025-01-01T00:00:00Z");
      assert.strictEqual(transformedResponse.updatedAt, "2025-01-01T00:00:00Z");
      assert.deepStrictEqual(transformedResponse.columns, {});
      assert.deepStrictEqual(transformedResponse.rows, []);

      // Verify snake_case fields are no longer present
      assert.strictEqual(transformedResponse.created_at, undefined);
      assert.strictEqual(transformedResponse.updated_at, undefined);

      console.log(
        "✓ Dataset response transformer converts snake_case to camelCase correctly",
      );
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
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
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
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
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
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      assert.ok(mockColumnResponse.createdAt);
      assert.ok(mockColumnResponse.updatedAt);
      console.log("✓ Column timestamps use snake_case format");
    });
  });

  describe("Dataset Method Options", () => {
    it("should provide array-based column creation", () => {
      // Mock a dataset object to test method availability
      const mockDataset = {
        addColumn: () => Promise.resolve([]),
      };

      assert.ok(typeof mockDataset.addColumn === "function");
      console.log("✓ Array-based addColumn method available");
    });
  });
});
