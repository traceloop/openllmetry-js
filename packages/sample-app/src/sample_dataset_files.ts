import * as traceloop from "@traceloop/node-server-sdk";

const main = async () => {
  traceloop.initialize({
    appName: "sample_dataset_files",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true,
    traceloopSyncEnabled: true,
  });

  try {
    await traceloop.waitForInitialization();
  } catch (error) {
    console.error(
      "Failed to initialize Traceloop SDK:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  const client = traceloop.getClient();
  if (!client) {
    console.error("Failed to initialize Traceloop client");
    return;
  }

  console.log("Dataset with Attachments Sample");
  console.log("================================\n");

  try {
    // 1. Create a new dataset for documents
    console.log("Creating dataset...");
    const dataset = await client.datasets.create({
      name: `documents-dataset-${Date.now()}`,
      description: "Dataset with file attachments",
    });
    console.log(`Created dataset: ${dataset.name} (slug: ${dataset.slug})\n`);

    // 2. Add columns including a file column
    console.log("Adding columns...");
    await dataset.addColumn([
      { name: "title", type: "string", required: true },
      { name: "category", type: "string" },
      { name: "document", type: "file" },
      { name: "processed", type: "boolean" },
    ]);
    console.log("Added 4 columns (including file type)\n");

    // 3. Add row with external URL attachment
    console.log("Adding row with external URL attachment...");
    const externalRows = await dataset.addRows([
      {
        title: "Sample PDF Document",
        category: "documentation",
        document: traceloop.attachment.url(
          "https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg",
          {
            fileType: "image",
            metadata: { source: "w3.org" },
          },
        ),
        processed: false,
      },
    ]);
    console.log(`Added row with external attachment\n`);

    // Check the attachment reference
    const externalRow = externalRows[0];
    const externalRef = externalRow.getAttachment("document");
    if (externalRef) {
      console.log(`  Storage type: ${externalRef.storageType}`);
      console.log(`  File type: ${externalRef.fileType}`);
      console.log(`  URL: ${externalRef.url}\n`);
    }

    // 4. Add row with buffer attachment
    console.log("Adding row with buffer attachment...");
    const textContent = "This is sample text content for the document.";
    const bufferRows = await dataset.addRows([
      {
        title: "Text Document",
        category: "notes",
        document: traceloop.attachment.buffer(
          Buffer.from(textContent),
          "notes.txt",
          {
            contentType: "text/plain",
            metadata: { author: "sample-app" },
          },
        ),
        processed: true,
      },
    ]);
    console.log(`Added row with buffer attachment\n`);

    const bufferRow = bufferRows[0];
    const bufferRef = bufferRow.getAttachment("document");
    if (bufferRef) {
      console.log(`  Storage type: ${bufferRef.storageType}`);
      console.log(`  File type: ${bufferRef.fileType}\n`);
    }

    // 5. Add row without attachment, then set it later
    console.log("Adding row and setting attachment later...");
    const emptyRows = await dataset.addRows([
      {
        title: "Document to update",
        category: "pending",
        document: null,
        processed: false,
      },
    ]);

    const rowToUpdate = emptyRows[0];
    const updatedRef = await rowToUpdate.setAttachment(
      "document",
      traceloop.attachment.url("https://example.com/updated-document.pdf", {
        fileType: "file",
      }),
    );
    console.log(`Set attachment on existing row`);
    console.log(`  Storage type: ${updatedRef.storageType}\n`);

    // 6. Get all rows and display summary
    console.log("Dataset summary:");
    const allRows = await dataset.getRows();
    console.log(`  Total rows: ${allRows.length}`);

    for (const row of allRows) {
      const att = row.getAttachment("document");
      console.log(`  - ${row.data.title}: ${att ? att.storageType : "no attachment"}`);
    }

    // 7. Clean up
    console.log("\nCleaning up...");
    await client.datasets.delete(dataset.slug);
    console.log(`Deleted dataset: ${dataset.slug}`);

    console.log("\nSample completed successfully!");
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack);
    }
  }
};

main().catch((error) => {
  console.error("Application failed:", error.message);
  process.exit(1);
});
