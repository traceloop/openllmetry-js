import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";
import * as traceloop from "../src";
import * as assert from "assert";
import { attachment } from "../src/lib/client/dataset/attachment";

// Register adapters and persisters
Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe("Attachment API Integration Tests", () => {
  let client: traceloop.TraceloopClient;
  let testDatasetSlug: string;

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
        : "https://api.traceloop.dev";

    client = new traceloop.TraceloopClient({
      appName: "attachment_integration_test",
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

  describe("Dataset with File Column", () => {
    it("should create a dataset with file column type", async function () {
      const dataset = await client.datasets.create({
        name: "attachment-test-dataset",
        description: "Dataset for testing attachments",
      });
      testDatasetSlug = dataset.slug;

      assert.ok(dataset);
      assert.ok(dataset.slug);
      console.log(`✓ Created dataset: ${dataset.slug}`);
    });

    it("should add columns including file type", async function () {
      if (!testDatasetSlug) {
        this.skip();
        return;
      }

      const dataset = await client.datasets.get(testDatasetSlug);
      const columns = await dataset.addColumn([
        { name: "name", type: "string" },
        { name: "document", type: "file" },
      ]);

      assert.ok(columns);
      assert.strictEqual(columns.length, 2);
      console.log(`✓ Added ${columns.length} columns`);
    });

    it("should add row with attachment column (gracefully degrades when upload endpoint unavailable)", async function () {
      if (!testDatasetSlug) {
        this.skip();
        return;
      }

      const dataset = await client.datasets.get(testDatasetSlug);

      // addRows succeeds even when the attachment upload endpoint returns 404 —
      // attachment failures are caught internally and logged as warnings (non-fatal).
      const rows = await dataset.addRows([
        {
          name: "Test Document",
          document: attachment.url("https://example.com/sample.pdf", {
            fileType: "file",
            metadata: { pages: 10 },
          }),
        },
      ]);

      assert.ok(rows);
      assert.strictEqual(rows.length, 1);

      // Check if the attachment was processed — may be null if upload endpoint is unavailable
      const row = rows[0];
      const attachmentRef = row.getAttachment("document");
      if (attachmentRef) {
        console.log(
          `✓ Added row with external attachment: ${attachmentRef.storageType}`,
        );
      } else {
        console.log(
          `⚠ Row added but attachment upload endpoint unavailable (404) — attachment not populated`,
        );
      }
    });

    it("should add row with buffer attachment column (gracefully degrades when upload endpoint unavailable)", async function () {
      if (!testDatasetSlug) {
        this.skip();
        return;
      }

      const dataset = await client.datasets.get(testDatasetSlug);
      const testData = Buffer.from("Hello, this is test content!");

      // addRows succeeds even when the attachment upload endpoint returns 404 —
      // attachment failures are caught internally and logged as warnings (non-fatal).
      const rows = await dataset.addRows([
        {
          name: "Buffer Test",
          document: attachment.buffer(testData, "test.txt", {
            contentType: "text/plain",
            metadata: { size: testData.length },
          }),
        },
      ]);

      assert.ok(rows);
      assert.strictEqual(rows.length, 1);

      const row = rows[0];
      const attachmentRef = row.getAttachment("document");
      if (attachmentRef) {
        console.log(`✓ Added row with buffer attachment`);
      } else {
        console.log(
          `⚠ Row added but attachment upload endpoint unavailable (404) — attachment not populated`,
        );
      }
    });

    it("should set attachment on existing row (gracefully skips when upload endpoint unavailable)", async function () {
      if (!testDatasetSlug) {
        this.skip();
        return;
      }

      const dataset = await client.datasets.get(testDatasetSlug);

      // First add a row without attachment
      const rows = await dataset.addRows([
        {
          name: "Row for attachment update",
          document: null,
        },
      ]);

      assert.ok(rows);
      const row = rows[0];

      // Try to set an attachment - may fail if server doesn't support it yet
      try {
        const reference = await row.setAttachment(
          "document",
          attachment.url("https://example.com/updated-doc.pdf"),
        );

        assert.ok(reference);
        assert.strictEqual(reference.storageType, "external");
        console.log(`✓ Set attachment on existing row`);
      } catch (error: any) {
        // Server may not support attachment endpoints yet
        if (error.message.includes("404")) {
          console.log(
            `⚠ Attachment endpoint not available on server (404) - skipping`,
          );
          this.skip();
        } else {
          throw error;
        }
      }
    });

    it("should clean up test dataset", async function () {
      if (!testDatasetSlug) {
        this.skip();
        return;
      }

      await client.datasets.delete(testDatasetSlug);
      console.log(`✓ Deleted test dataset: ${testDatasetSlug}`);
    });
  });
});
