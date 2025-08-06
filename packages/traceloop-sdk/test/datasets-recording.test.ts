import * as assert from "assert";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import * as traceloop from "../src";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

let client: traceloop.TraceloopClient;
let createdDatasetSlug: string;

describe("Test Dataset API Recording", () => {
  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      headers: false,
    },
  });

  before(async () => {
    // Set staging environment variables for recording
    if (process.env.RECORD_MODE === "NEW") {
      // Use real API keys for recording
      if (!process.env.TRACELOOP_API_KEY) {
        throw new Error('TRACELOOP_API_KEY environment variable is required for recording');
      }
      if (!process.env.TRACELOOP_BASE_URL) {
        throw new Error('TRACELOOP_BASE_URL environment variable is required for recording');
      }
    } else {
      // Use dummy values for playback
      process.env.TRACELOOP_API_KEY = process.env.TRACELOOP_API_KEY || "test-key";
      process.env.TRACELOOP_BASE_URL = process.env.TRACELOOP_BASE_URL || "https://api-staging.traceloop.com";
    }

    client = new traceloop.TraceloopClient({
      appName: "dataset_recording_test",
      apiKey: process.env.TRACELOOP_API_KEY,
      baseUrl: process.env.TRACELOOP_BASE_URL,
      projectId: "default"
    });
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "authorization",
      );
    });
  });

  afterEach(async () => {
    memoryExporter.reset();
  });

  describe("Dataset Creation and Management", () => {
    it("should create a new dataset", async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const datasetName = `test-dataset-${timestamp}`;
      
      const dataset = await client.datasets.create({
        name: datasetName,
        description: "Test dataset for recording"
      });

      assert.ok(dataset);
      assert.ok(dataset.slug);
      assert.strictEqual(dataset.name, datasetName);
      assert.strictEqual(dataset.description, "Test dataset for recording");
      
      createdDatasetSlug = dataset.slug;
      console.log(`Created dataset with slug: ${createdDatasetSlug}`);
    });

    it("should get dataset by slug", async () => {
      if (!createdDatasetSlug) {
        this.skip();
      }

      const dataset = await client.datasets.get(createdDatasetSlug);
      assert.ok(dataset);
      assert.strictEqual(dataset.slug, createdDatasetSlug);
    });

    it("should list datasets", async () => {
      const result = await client.datasets.list();
      assert.ok(result);
      assert.ok(Array.isArray(result.datasets));
      assert.ok(typeof result.total === 'number');
      console.log(`Found ${result.total} datasets`);
    });

    it("should update dataset", async () => {
      if (!createdDatasetSlug) {
        this.skip();
      }

      const dataset = await client.datasets.get(createdDatasetSlug);
      await dataset.update({
        description: "Updated description for recording test"
      });

      // Refresh the dataset to get the updated data
      await dataset.refresh();
      assert.strictEqual(dataset.description, "Updated description for recording test");
    });
  });

  describe("Column Operations", () => {
    let testDataset: any;

    before(async () => {
      if (createdDatasetSlug) {
        testDataset = await client.datasets.get(createdDatasetSlug);
      }
    });

    it("should add columns to dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      const column1 = await testDataset.addColumn({
        name: "name",
        type: "string",
        required: true,
        description: "Name column"
      });

      assert.ok(column1);
      assert.strictEqual(column1.name, "name");
      assert.strictEqual(column1.type, "string");
      assert.strictEqual(column1.required, true);

      const column2 = await testDataset.addColumn({
        name: "score",
        type: "number",
        required: false,
        description: "Score column"
      });

      assert.ok(column2);
      assert.strictEqual(column2.name, "score");
      assert.strictEqual(column2.type, "number");
    });

    it("should get columns from dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      const columns = await testDataset.getColumns();
      assert.ok(Array.isArray(columns));
      assert.ok(columns.length >= 2);
      
      const nameColumn = columns.find(col => col.name === "name");
      const scoreColumn = columns.find(col => col.name === "score");
      
      assert.ok(nameColumn);
      assert.ok(scoreColumn);
    });
  });

  describe("Row Operations", () => {
    let testDataset: any;

    before(async () => {
      if (createdDatasetSlug) {
        testDataset = await client.datasets.get(createdDatasetSlug);
      }
    });

    it("should add single row to dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      const row = await testDataset.addRow({
        name: "John Doe",
        score: 85
      });

      assert.ok(row);
      assert.ok(row.id);
      assert.strictEqual(row.data.name, "John Doe");
      assert.strictEqual(row.data.score, 85);
    });

    it("should add multiple rows to dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      const rows = await testDataset.addRows([
        { name: "Jane Smith", score: 92 },
        { name: "Bob Johnson", score: 78 },
        { name: "Alice Brown", score: 95 }
      ]);

      assert.ok(Array.isArray(rows));
      assert.strictEqual(rows.length, 3);
      assert.strictEqual(rows[0].data.name, "Jane Smith");
      assert.strictEqual(rows[1].data.name, "Bob Johnson");
      assert.strictEqual(rows[2].data.name, "Alice Brown");
    });

    it("should get rows from dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      const rows = await testDataset.getRows(10, 0);
      assert.ok(Array.isArray(rows));
      assert.ok(rows.length >= 4); // At least 4 rows from previous tests
    });
  });

  describe("CSV Import", () => {
    let testDataset: any;

    before(async () => {
      if (createdDatasetSlug) {
        testDataset = await client.datasets.get(createdDatasetSlug);
      }
    });

    it("should import CSV data with headers", async () => {
      if (!testDataset) {
        this.skip();
      }

      const csvContent = `name,score
Michael Wilson,88
Sarah Davis,91
Tom Anderson,76`;

      await testDataset.fromCSV(csvContent, { hasHeader: true });
      // Verify import by getting rows
      const rows = await testDataset.getRows(20, 0);
      assert.ok(rows.length >= 7); // Should have at least 7 rows now
    });
  });

  describe("Dataset Publishing and Versions", () => {
    let testDataset: any;

    before(async () => {
      if (createdDatasetSlug) {
        testDataset = await client.datasets.get(createdDatasetSlug);
      }
    });

    it("should publish dataset", async () => {
      if (!testDataset) {
        this.skip();
      }

      await testDataset.publish({
        version: "1.0.0",
        description: "First published version"
      });

      // Refresh to get updated data
      await testDataset.refresh();
      assert.strictEqual(testDataset.published, true);
    });

    it("should get dataset versions", async () => {
      if (!testDataset) {
        this.skip();
      }

      const versions = await testDataset.getVersions();
      assert.ok(versions);
      assert.ok(Array.isArray(versions.versions));
      assert.ok(versions.versions.length >= 1);
    });

    it("should get dataset stats", async () => {
      if (!testDataset) {
        this.skip();
      }

      const stats = await testDataset.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.rowCount === 'number');
      assert.ok(typeof stats.columnCount === 'number');
    });
  });

  describe("Cleanup", () => {
    it("should delete the test dataset", async () => {
      if (!createdDatasetSlug) {
        this.skip();
      }

      const dataset = await client.datasets.get(createdDatasetSlug);
      await dataset.delete();
      
      // Verify deletion by trying to get it (should fail)
      try {
        await client.datasets.get(createdDatasetSlug);
        assert.fail("Should have thrown an error for deleted dataset");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Expected error for deleted dataset
      }
    });
  });
}); 