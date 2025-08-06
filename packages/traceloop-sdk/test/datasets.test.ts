import * as assert from "assert";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import * as traceloop from "../src";

const memoryExporter = new InMemorySpanExporter();

let client: traceloop.TraceloopClient;

describe("Datasets", () => {
  let originalFetch: typeof global.fetch;

  before(() => {
    originalFetch = global.fetch;
    client = new traceloop.TraceloopClient({
      appName: "test_datasets",
      apiKey: "test-key",
      baseUrl: "https://api.traceloop.com",
    });
  });

  afterEach(() => {
    memoryExporter.reset();
    global.fetch = originalFetch;
  });

  describe("Dataset Creation", () => {
    it("should create a new dataset", async () => {
      const mockDataset = {
        id: "dataset-123",
        name: "test-dataset",
        description: "Test dataset",
        version: 1,
        published: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockDataset), {
          status: 200,
        })) as typeof global.fetch;

      const dataset = await client.datasets.create({
        name: "test-dataset",
        description: "Test dataset"
      });

      assert.ok(dataset);
      assert.strictEqual(dataset.id, "dataset-123");
      assert.strictEqual(dataset.name, "test-dataset");
      assert.strictEqual(dataset.description, "Test dataset");
      assert.strictEqual(dataset.published, false);
    });

    it("should include correct headers and payload for dataset creation", async () => {
      let capturedUrl: string | undefined;
      let capturedHeaders: HeadersInit | undefined;
      let capturedBody: string | undefined;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedHeaders = init?.headers;
        capturedBody = init?.body as string;
        return new Response(JSON.stringify({
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }), { status: 200 });
      }) as typeof global.fetch;

      await client.datasets.create({
        name: "test-dataset",
        description: "Test dataset"
      });

      const parsedBody = JSON.parse(capturedBody!);
      assert.strictEqual(capturedUrl, "https://api.traceloop.com/v1/datasets");
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
      assert.strictEqual(parsedBody.name, "test-dataset");
      assert.strictEqual(parsedBody.description, "Test dataset");
    });

    it("should validate dataset name", async () => {
      try {
        await client.datasets.create({ name: "" });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("Dataset name is required"));
      }
    });
  });

  describe("Dataset Retrieval", () => {
    it("should get a dataset by ID", async () => {
      const mockDataset = {
        id: "dataset-123",
        name: "test-dataset",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockDataset), { status: 200 })
      ) as typeof global.fetch;

      const dataset = await client.datasets.get("dataset-123");
      assert.strictEqual(dataset.id, "dataset-123");
      assert.strictEqual(dataset.name, "test-dataset");
    });

    it("should list datasets", async () => {
      const mockResponse = {
        datasets: [
          {
            id: "dataset-1",
            name: "dataset-1",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          },
          {
            id: "dataset-2",
            name: "dataset-2",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          }
        ],
        total: 2,
        page: 1,
        limit: 50
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockResponse), { status: 200 })
      ) as typeof global.fetch;

      const result = await client.datasets.list();
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.datasets.length, 2);
      assert.strictEqual(result.datasets[0].id, "dataset-1");
    });

    it("should find dataset by name", async () => {
      const mockResponse = {
        datasets: [{
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }],
        total: 1,
        page: 1,
        limit: 50
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockResponse), { status: 200 })
      ) as typeof global.fetch;

      const dataset = await client.datasets.findByName("test-dataset");
      assert.ok(dataset);
      assert.strictEqual(dataset!.name, "test-dataset");
    });
  });

  describe("Dataset Operations", () => {
    let dataset: any;

    beforeEach(async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }), { status: 200 })
      ) as typeof global.fetch;

      dataset = await client.datasets.create({ name: "test-dataset" });
    });

    it("should update a dataset", async () => {
      const updatedData = {
        id: "dataset-123",
        name: "updated-dataset",
        description: "Updated description",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(updatedData), { status: 200 })
      ) as typeof global.fetch;

      await dataset.update({ name: "updated-dataset", description: "Updated description" });
      assert.strictEqual(dataset.name, "updated-dataset");
      assert.strictEqual(dataset.description, "Updated description");
    });

    it("should delete a dataset", async () => {
      global.fetch = (async () =>
        new Response(null, { status: 204 })
      ) as typeof global.fetch;

      await dataset.delete();
      // No assertion needed, should not throw
    });

    it("should publish a dataset", async () => {
      const publishedData = {
        id: "dataset-123",
        name: "test-dataset",
        published: true,
        version: 2,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(publishedData), { status: 200 })
      ) as typeof global.fetch;

      await dataset.publish({ version: "2.0" });
      assert.strictEqual(dataset.published, true);
      assert.strictEqual(dataset.version, 2);
    });
  });

  describe("Column Operations", () => {
    let dataset: any;

    beforeEach(async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }), { status: 200 })
      ) as typeof global.fetch;

      dataset = await client.datasets.create({ name: "test-dataset" });
    });

    it("should add a column to dataset", async () => {
      const mockColumn = {
        id: "column-123",
        datasetId: "dataset-123",
        name: "score",
        type: "number",
        required: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockColumn), { status: 200 })
      ) as typeof global.fetch;

      const column = await dataset.addColumn({
        name: "score",
        type: "number",
        required: false
      });

      assert.strictEqual(column.name, "score");
      assert.strictEqual(column.type, "number");
      assert.strictEqual(column.datasetId, "dataset-123");
    });

    it("should get columns from dataset", async () => {
      const mockResponse = {
        columns: [
          {
            id: "column-1",
            datasetId: "dataset-123",
            name: "name",
            type: "string",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          },
          {
            id: "column-2",
            datasetId: "dataset-123",
            name: "score",
            type: "number",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          }
        ]
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockResponse), { status: 200 })
      ) as typeof global.fetch;

      const columns = await dataset.getColumns();
      assert.strictEqual(columns.length, 2);
      assert.strictEqual(columns[0].name, "name");
      assert.strictEqual(columns[1].name, "score");
    });
  });

  describe("Row Operations", () => {
    let dataset: any;

    beforeEach(async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }), { status: 200 })
      ) as typeof global.fetch;

      dataset = await client.datasets.create({ name: "test-dataset" });
    });

    it("should add a row to dataset", async () => {
      const mockRow = {
        id: "row-123",
        datasetId: "dataset-123",
        data: { name: "John", score: 85 },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockRow), { status: 200 })
      ) as typeof global.fetch;

      const row = await dataset.addRow({ name: "John", score: 85 });
      assert.strictEqual(row.data.name, "John");
      assert.strictEqual(row.data.score, 85);
    });

    it("should add multiple rows to dataset", async () => {
      const mockResponse = {
        rows: [
          {
            id: "row-1",
            datasetId: "dataset-123",
            data: { name: "John", score: 85 },
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          },
          {
            id: "row-2",
            datasetId: "dataset-123",
            data: { name: "Jane", score: 92 },
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          }
        ]
      };

      global.fetch = (async () =>
        new Response(JSON.stringify(mockResponse), { status: 200 })
      ) as typeof global.fetch;

      const rows = await dataset.addRows([
        { name: "John", score: 85 },
        { name: "Jane", score: 92 }
      ]);

      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].data.name, "John");
      assert.strictEqual(rows[1].data.name, "Jane");
    });
  });

  describe("CSV Import", () => {
    let dataset: any;

    beforeEach(async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({
          id: "dataset-123",
          name: "test-dataset",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }), { status: 200 })
      ) as typeof global.fetch;

      dataset = await client.datasets.create({ name: "test-dataset" });
    });

    it("should import CSV data", async () => {
      const csvContent = `name,score,active
John,85,true
Jane,92,false
Bob,78,true`;

      global.fetch = (async () =>
        new Response(JSON.stringify({
          rows: [
            { id: "row-1", datasetId: "dataset-123", data: { name: "John", score: 85, active: true }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
            { id: "row-2", datasetId: "dataset-123", data: { name: "Jane", score: 92, active: false }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
            { id: "row-3", datasetId: "dataset-123", data: { name: "Bob", score: 78, active: true }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" }
          ]
        }), { status: 200 })
      ) as typeof global.fetch;

      await dataset.fromCSV(csvContent);
      // No assertion needed, should not throw
    });

    it("should handle CSV without headers", async () => {
      const csvContent = `John,85,true
Jane,92,false`;

      global.fetch = (async () =>
        new Response(JSON.stringify({
          rows: [
            { id: "row-1", datasetId: "dataset-123", data: { column_1: "John", column_2: 85, column_3: true }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
            { id: "row-2", datasetId: "dataset-123", data: { column_1: "Jane", column_2: 92, column_3: false }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" }
          ]
        }), { status: 200 })
      ) as typeof global.fetch;

      await dataset.fromCSV(csvContent, { hasHeader: false });
      // No assertion needed, should not throw
    });
  });

  describe("Error Handling", () => {
    it("should handle HTTP errors gracefully", async () => {
      global.fetch = (async () =>
        new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
      ) as typeof global.fetch;

      try {
        await client.datasets.get("non-existent-id");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("Not found"));
      }
    });

    it("should handle network errors", async () => {
      global.fetch = (async () => {
        throw new Error("Network error");
      }) as typeof global.fetch;

      try {
        await client.datasets.create({ name: "test" });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("Network error"));
      }
    });
  });
});