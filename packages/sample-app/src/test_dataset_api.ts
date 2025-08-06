import * as traceloop from "@traceloop/node-server-sdk";

const main = async () => {
  // Initialize with staging environment
  traceloop.initialize({
    appName: "test_dataset_api",
    disableBatch: true,
    traceloopSyncEnabled: true,
  });

  await traceloop.waitForInitialization();

  const client = traceloop.getClient();
  if (!client) {
    console.error("❌ Failed to initialize Traceloop client");
    return;
  }

  console.log("🧪 Testing Dataset API with staging environment");
  console.log("=================================================\n");

  try {
    // Test 1: List existing datasets
    console.log("1️⃣ Testing dataset list...");
    try {
      const datasetsList = await client.datasets.list(1, 10);
      console.log(`✅ Found ${datasetsList.total} datasets`);
      
      if (datasetsList.datasets.length > 0) {
        console.log("📋 Existing datasets:");
        datasetsList.datasets.slice(0, 5).forEach((dataset, index) => {
          console.log(`   ${index + 1}. ${dataset.name} (ID: ${dataset.id})`);
          console.log(`      Description: ${dataset.description || 'No description'}`);
          console.log(`      Published: ${dataset.published ? 'Yes' : 'No'}\n`);
        });
      }
    } catch (error) {
      console.log(`❌ List datasets failed: ${error.message}`);
    }

    // Test 2: Create a new dataset  
    console.log("2️⃣ Testing dataset creation...");
    try {
      const testDataset = await client.datasets.create({
        name: `test-dataset-${Date.now()}`,
        description: "Test dataset created from JavaScript SDK"
      });
      console.log(`✅ Created dataset: ${testDataset.name}`);
      console.log(`   ID: ${testDataset.id}`);
      console.log(`   Description: ${testDataset.description}\n`);

      // Test 3: Add columns
      console.log("3️⃣ Testing column addition...");
      try {
        await testDataset.addColumn({
          name: "user_id",
          type: "string",
          required: true,
          description: "User identifier"
        });

        await testDataset.addColumn({
          name: "score",
          type: "number",
          required: false,
          description: "User score"
        });

        await testDataset.addColumn({
          name: "active",
          type: "boolean", 
          required: false,
          description: "User active status"
        });

        console.log("✅ Added 3 columns successfully\n");

        // Test 4: Get columns
        console.log("4️⃣ Testing column retrieval...");
        const columns = await testDataset.getColumns();
        console.log(`✅ Retrieved ${columns.length} columns:`);
        columns.forEach(col => {
          console.log(`   • ${col.name} (${col.type})${col.required ? ' [required]' : ''}`);
        });
        console.log();

      } catch (error) {
        console.log(`❌ Column operations failed: ${error.message}`);
      }

      // Test 5: Add rows
      console.log("5️⃣ Testing row addition...");
      try {
        const row1 = await testDataset.addRow({
          user_id: "user123",
          score: 85,
          active: true
        });
        console.log(`✅ Added row 1: ID ${row1.id}`);

        const row2 = await testDataset.addRow({
          user_id: "user456", 
          score: 92,
          active: false
        });
        console.log(`✅ Added row 2: ID ${row2.id}`);

        // Test batch row addition
        const batchRows = [
          { user_id: "user789", score: 78, active: true },
          { user_id: "user101", score: 95, active: true }
        ];
        const addedRows = await testDataset.addRows(batchRows);
        console.log(`✅ Added ${addedRows.length} rows in batch\n`);

      } catch (error) {
        console.log(`❌ Row addition failed: ${error.message}`);
      }

      // Test 6: Retrieve rows
      console.log("6️⃣ Testing row retrieval...");
      try {
        const rows = await testDataset.getRows(10);
        console.log(`✅ Retrieved ${rows.length} rows:`);
        rows.forEach((row, index) => {
          console.log(`   ${index + 1}. User: ${row.data.user_id}, Score: ${row.data.score}, Active: ${row.data.active}`);
        });
        console.log();
      } catch (error) {
        console.log(`❌ Row retrieval failed: ${error.message}`);
      }

      // Test 7: CSV import
      console.log("7️⃣ Testing CSV import...");
      try {
        const csvData = `user_id,score,active
user202,88,true
user303,91,false
user404,76,true`;

        await testDataset.fromCSV(csvData, { hasHeader: true });
        console.log("✅ CSV import successful\n");

        // Verify CSV import worked
        const allRows = await testDataset.getRows(20);
        console.log(`📊 Total rows after CSV import: ${allRows.length}`);
      } catch (error) {
        console.log(`❌ CSV import failed: ${error.message}`);
      }

      // Test 8: Dataset statistics
      console.log("8️⃣ Testing dataset statistics...");
      try {
        const stats = await testDataset.getStats();
        console.log("✅ Dataset statistics:");
        console.log(`   • Rows: ${stats.rowCount}`);
        console.log(`   • Columns: ${stats.columnCount}`);
        console.log(`   • Size: ${stats.size} bytes`);
        console.log(`   • Last modified: ${stats.lastModified}\n`);
      } catch (error) {
        console.log(`❌ Statistics retrieval failed: ${error.message}`);
      }

      // Test 9: Dataset versions
      console.log("9️⃣ Testing dataset versions...");
      try {
        const versions = await testDataset.getVersions();
        console.log(`✅ Dataset versions: ${versions.total}`);
        if (versions.versions.length > 0) {
          versions.versions.forEach(version => {
            console.log(`   • Version: ${version.version}`);
            console.log(`     Published by: ${version.publishedBy}`);
            console.log(`     Published at: ${version.publishedAt}`);
          });
        } else {
          console.log("   No versions found (dataset not published)");
        }
        console.log();
      } catch (error) {
        console.log(`❌ Version retrieval failed: ${error.message}`);
      }

      // Test 10: Dataset publishing
      console.log("🔟 Testing dataset publishing...");
      try {
        await testDataset.publish({
          version: "v1.0",
          description: "Initial test version"
        });
        console.log(`✅ Dataset published successfully!`);
        console.log(`   Published status: ${testDataset.published}\n`);

        // Check versions after publishing
        const versionsAfterPublish = await testDataset.getVersions();
        console.log(`📚 Versions after publish: ${versionsAfterPublish.total}`);
        versionsAfterPublish.versions.forEach(version => {
          console.log(`   • ${version.version} (${version.publishedAt})`);
        });
        console.log();

      } catch (error) {
        console.log(`❌ Dataset publishing failed: ${error.message}`);
      }

      // Test 11: Dataset retrieval by ID
      console.log("1️⃣1️⃣ Testing dataset retrieval by ID...");
      try {
        const retrievedDataset = await client.datasets.get(testDataset.id);
        console.log(`✅ Retrieved dataset by ID:`);
        console.log(`   Name: ${retrievedDataset.name}`);
        console.log(`   ID: ${retrievedDataset.id}`);
        console.log(`   Published: ${retrievedDataset.published}\n`);
      } catch (error) {
        console.log(`❌ Dataset retrieval by ID failed: ${error.message}`);
      }

      // Test 12: Dataset search by name
      console.log("1️⃣2️⃣ Testing dataset search by name...");
      try {
        const foundDataset = await client.datasets.findByName(testDataset.name);
        if (foundDataset) {
          console.log(`✅ Found dataset by name:`);
          console.log(`   Name: ${foundDataset.name}`);
          console.log(`   ID: ${foundDataset.id}\n`);
        } else {
          console.log(`❌ Dataset not found by name\n`);
        }
      } catch (error) {
        console.log(`❌ Dataset search by name failed: ${error.message}`);
      }

      console.log("🎉 All tests completed!");
      
    } catch (error) {
      console.log(`❌ Dataset creation failed: ${error.message}`);
      console.log("This might indicate an issue with the Dataset API endpoints");
    }

  } catch (error) {
    console.error("❌ Critical error:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
};

// Run the test
main().catch((error) => {
  console.error("💥 Test failed:", error.message);
  process.exit(1);
});