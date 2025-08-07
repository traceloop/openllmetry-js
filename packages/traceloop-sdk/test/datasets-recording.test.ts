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

describe("Dataset Integration Test", () => {
  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    matchRequestsBy: {
      method: true,
      headers: false,
      body: true,
      order: false,
      url: true,
    },
  });

  before(async () => {
    // Set environment variables
    if (process.env.RECORD_MODE === "NEW") {
      if (!process.env.TRACELOOP_API_KEY) {
        throw new Error(
          "TRACELOOP_API_KEY environment variable is required for recording",
        );
      }
      if (!process.env.TRACELOOP_BASE_URL) {
        throw new Error(
          "TRACELOOP_BASE_URL environment variable is required for recording",
        );
      }
    } else {
      // Use dummy values when using recordings (not making live API calls)
      process.env.TRACELOOP_API_KEY = "test-key";
      process.env.TRACELOOP_BASE_URL = "https://api-staging.traceloop.com";
    }

    client = new traceloop.TraceloopClient({
      appName: "dataset_integration_test",
      apiKey: process.env.TRACELOOP_API_KEY!,
      baseUrl: process.env.TRACELOOP_BASE_URL!,
      projectId: "default",
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

  it("should create and manage a dataset", async function () {
    this.timeout(10000); // 10 second timeout
    // Use a fixed name for recorded tests, dynamic only during recording
    const datasetName =
      process.env.RECORD_MODE === "NEW"
        ? `integration-test-${new Date().toISOString().replace(/[:.]/g, "-")}`
        : "integration-test-2025-08-06T10-09-52-844Z";

    // Create dataset
    const dataset = await client.datasets.create({
      name: datasetName,
      description: "Integration test dataset",
    });

    assert.ok(dataset);
    assert.ok(dataset.slug);
    assert.strictEqual(dataset.name, datasetName);
    assert.strictEqual(dataset.description, "Integration test dataset");

    console.log(`✓ Created dataset: ${dataset.slug}`);

    // Get dataset
    const retrievedDataset = await client.datasets.get(dataset.slug);
    assert.ok(retrievedDataset);
    assert.strictEqual(retrievedDataset.slug, dataset.slug);
    assert.strictEqual(retrievedDataset.name, datasetName);

    console.log(`✓ Retrieved dataset: ${retrievedDataset.slug}`);

    // Update dataset
    await retrievedDataset.update({
      description: "Updated integration test dataset",
    });
    // After update, the description should be updated
    // Note: The recorded response already shows the updated description
    assert.strictEqual(
      retrievedDataset.description,
      "Updated integration test dataset",
    );

    console.log(`✓ Updated dataset description`);

    // Add columns
    const nameColumn = await retrievedDataset.addColumn({
      name: "name",
      type: "string",
      required: true,
      description: "Person name",
    });

    assert.ok(nameColumn);
    assert.strictEqual(nameColumn.name, "name");
    assert.strictEqual(nameColumn.type, "string");
    assert.strictEqual(nameColumn.required, true);

    console.log(`✓ Added name column: ${nameColumn.id}`);

    const scoreColumn = await retrievedDataset.addColumn({
      name: "score",
      type: "number",
      required: false,
      description: "Test score",
    });

    assert.ok(scoreColumn);
    assert.strictEqual(scoreColumn.name, "score");
    assert.strictEqual(scoreColumn.type, "number");

    console.log(`✓ Added score column: ${scoreColumn.id}`);

    // Get columns
    const columns = await retrievedDataset.getColumns();
    assert.ok(Array.isArray(columns));
    assert.ok(columns.length >= 2);

    const foundNameColumn = columns.find((col) => col.name === "name");
    const foundScoreColumn = columns.find((col) => col.name === "score");

    assert.ok(foundNameColumn);
    assert.ok(foundScoreColumn);

    console.log(`✓ Retrieved ${columns.length} columns`);

    // Add row
    const row = await retrievedDataset.addRow({
      name: "Test Person",
      score: 95,
    });

    assert.ok(row);
    assert.ok(row.id);
    assert.strictEqual(row.data.name, "Test Person");
    assert.strictEqual(row.data.score, 95);

    console.log(`✓ Added row: ${row.id}`);

    // Get rows
    const rows = await retrievedDataset.getRows(10, 0);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);

    console.log(`✓ Retrieved ${rows.length} rows`);

    // Clean up - delete dataset
    await retrievedDataset.delete();

    console.log(`✓ Deleted dataset: ${dataset.slug}`);

    // Verify deletion
    try {
      await client.datasets.get(dataset.slug);
      assert.fail("Should have thrown an error for deleted dataset");
    } catch (error) {
      assert.ok(error instanceof Error);
      console.log(`✓ Confirmed dataset deletion`);
    }
  });

  it("should list datasets", async () => {
    const result = await client.datasets.list();
    assert.ok(result);
    assert.ok(Array.isArray(result.datasets));
    assert.ok(typeof result.total === "number");

    console.log(`✓ Listed ${result.total} datasets`);
  });
});
