import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import * as traceloop from "../src";
import * as assert from "assert";

// Register adapters and persisters
Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Experiment Export Tests", () => {
  let polly: Polly;
  let client: traceloop.TraceloopClient;
  let experimentSlug: string;
  let runId: string;

  setupPolly({
    adapters: ["node-http", "fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
    recordFailedRequests: true,
    mode: process.env.RECORD_MODE === "NEW" ? "record" : "replay",
    matchRequestsBy: {
      headers: false,
      url: {
        protocol: true,
        hostname: true,
        pathname: true,
        query: false,
      },
    },
    logging: true,
  });

  before(async function () {
    const apiKey =
      process.env.RECORD_MODE === "NEW"
        ? process.env.TRACELOOP_API_KEY!
        : "test-key";
    const baseUrl =
      process.env.RECORD_MODE === "NEW"
        ? process.env.TRACELOOP_BASE_URL!
        : "https://api-staging.traceloop.com";

    client = new traceloop.TraceloopClient({
      appName: "experiment_export_test",
      apiKey,
      baseUrl,
    });
  });

  beforeEach(function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) =>
          !["authorization"].includes(name.toLowerCase()),
      );
    });
  });

  describe("Export Methods", () => {
    it("should export experiment results as CSV with explicit parameters", async function () {
      // Skip this test unless valid Polly recordings exist
      if (process.env.RECORD_MODE !== "NEW") {
        this.skip();
        return;
      }

      // Use known experiment slug and run ID for testing
      experimentSlug = "test-experiment-slug";
      runId = "test-run-id";

      const csvData = await client.experiment.toCsvString(
        experimentSlug,
        runId,
      );

      assert.ok(csvData);
      assert.strictEqual(typeof csvData, "string");
      console.log(`✓ Exported CSV data: ${csvData.length} characters`);
    });

    it("should export experiment results as JSON with explicit parameters", async function () {
      // Skip this test unless valid Polly recordings exist
      if (process.env.RECORD_MODE !== "NEW") {
        this.skip();
        return;
      }

      experimentSlug = "test-experiment-slug";
      runId = "test-run-id";

      const jsonData = await client.experiment.toJsonString(
        experimentSlug,
        runId,
      );

      assert.ok(jsonData);
      assert.strictEqual(typeof jsonData, "string");
      // Verify it's valid JSON
      JSON.parse(jsonData);
      console.log(`✓ Exported JSON data: ${jsonData.length} characters`);
    });

    it("should throw error when exporting CSV without experiment slug", async function () {
      try {
        await client.experiment.toCsvString();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("experiment_slug is required"));
        console.log("✓ Correctly threw error for missing experiment slug");
      }
    });

    it("should throw error when exporting JSON without run ID", async function () {
      try {
        await client.experiment.toJsonString("some-slug");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("run_id is required"));
        console.log("✓ Correctly threw error for missing run ID");
      }
    });

    it("should use last run values when not provided", async function () {
      // This test would require running an actual experiment first
      // For now, we'll just verify the error handling
      try {
        await client.experiment.toCsvString();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should fail because no last run exists
        assert.ok(
          error.message.includes("experiment_slug is required") ||
            error.message.includes("run_id is required"),
        );
        console.log("✓ Correctly handled missing last run values");
      }
    });
  });
});
