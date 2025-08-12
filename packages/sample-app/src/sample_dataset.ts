import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

const main = async () => {
  // Initialize Traceloop SDK
  traceloop.initialize({
    appName: "sample_dataset",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true,
    traceloopSyncEnabled: true,
  });

  await traceloop.waitForInitialization();

  const client = traceloop.getClient();
  if (!client) {
    console.error("Failed to initialize Traceloop client");
    return;
  }

  console.log("🚀 Dataset API Sample Application");
  console.log("==================================\n");

  try {
    // 1. Create a new dataset for tracking LLM interactions
    console.log("📝 Creating a new dataset...");
    const dataset = await client.datasets.create({
      name: `llm-interactions-${Date.now()}`,
      description:
        "Dataset for tracking OpenAI chat completions and user interactions",
    });

    console.log(`✅ Dataset created: ${dataset.name} (ID: ${dataset.id})\n`);

    // 2. Define the schema by adding columns
    console.log("🏗️ Adding columns to define schema...");

    await dataset.addColumn([
      {
        name: "user_id",
        type: "string",
        required: true,
        description: "Unique identifier for the user",
      },
      {
        name: "prompt",
        type: "string",
        required: true,
        description: "The user's input prompt",
      },
      {
        name: "response",
        type: "string",
        required: true,
        description: "The AI model's response",
      },
      {
        name: "model",
        type: "string",
        required: true,
        description: "The AI model used (e.g., gpt-4)",
      },
      {
        name: "tokens_used",
        type: "number",
        required: false,
        description: "Total tokens consumed",
      },
      {
        name: "response_time_ms",
        type: "number",
        required: false,
        description: "Response time in milliseconds",
      },
      {
        name: "satisfaction_score",
        type: "number",
        required: false,
        description: "User satisfaction rating (1-5)",
      },
      {
        name: "timestamp",
        type: "string",
        required: true,
        description: "When the interaction occurred",
      },
    ]);

    console.log("✅ Schema defined with 8 columns\n");

    // 3. Simulate some LLM interactions and collect data
    console.log("🤖 Simulating LLM interactions...");

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const samplePrompts = [
      "Explain machine learning in simple terms",
      "Write a Python function to calculate fibonacci numbers",
      "What are the benefits of using TypeScript?",
      "How does async/await work in JavaScript?",
      "Explain the concept of closures in programming",
    ];

    const interactions = [];

    for (let i = 0; i < samplePrompts.length; i++) {
      const prompt = samplePrompts[i];
      const userId = `user_${String(i + 1).padStart(3, "0")}`;

      console.log(`  Processing prompt ${i + 1}/${samplePrompts.length}...`);

      const startTime = Date.now();

      try {
        // Make actual OpenAI API call
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
        });

        const endTime = Date.now();
        const response =
          completion.choices[0]?.message?.content || "No response";
        const tokensUsed = completion.usage?.total_tokens || 0;
        const responseTime = endTime - startTime;

        const interaction = {
          user_id: userId,
          prompt: prompt,
          response: response,
          model: "gpt-3.5-turbo",
          tokens_used: tokensUsed,
          response_time_ms: responseTime,
          satisfaction_score: Math.floor(Math.random() * 5) + 1, // Random satisfaction 1-5
          timestamp: new Date().toISOString(),
        };

        interactions.push(interaction);

        // Add individual row to dataset
        await dataset.addRow(interaction);
      } catch (error) {
        console.log(
          `    ⚠️ Error with prompt ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Add error interaction data
        const errorInteraction = {
          user_id: userId,
          prompt: prompt,
          response: `Error: ${error instanceof Error ? error.message : String(error)}`,
          model: "gpt-3.5-turbo",
          tokens_used: 0,
          response_time_ms: Date.now() - startTime,
          satisfaction_score: 1,
          timestamp: new Date().toISOString(),
        };

        interactions.push(errorInteraction);
        await dataset.addRow(errorInteraction);
      }
    }

    console.log(`✅ Added ${interactions.length} interaction records\n`);

    // 4. Import additional data from CSV
    console.log("📊 Importing additional data from CSV...");

    const csvData = `user_id,prompt,response,model,tokens_used,response_time_ms,satisfaction_score,timestamp
user_006,"What is React?","React is a JavaScript library for building user interfaces...","gpt-3.5-turbo",85,1200,4,"2024-01-15T10:30:00Z"
user_007,"Explain Docker","Docker is a containerization platform that allows you to package applications...","gpt-3.5-turbo",120,1500,5,"2024-01-15T10:35:00Z"
user_008,"What is GraphQL?","GraphQL is a query language and runtime for APIs...","gpt-3.5-turbo",95,1100,4,"2024-01-15T10:40:00Z"`;

    await dataset.fromCSV(csvData, { hasHeader: true });
    console.log("✅ Imported 3 additional records from CSV\n");

    // 5. Get dataset info
    console.log("📈 Getting dataset information...");
    const rows = await dataset.getRows(); // Get all rows
    const columns = await dataset.getColumns(); // Get all columns
    console.log(`  • Total rows: ${rows.length}`);
    console.log(`  • Total columns: ${columns.length}`);
    console.log(`  • Last updated: ${dataset.updatedAt}\n`);

    // 6. Retrieve and analyze some data
    console.log("🔍 Analyzing collected data...");
    const analysisRows = rows.slice(0, 10); // Get first 10 rows for analysis

    if (analysisRows.length > 0) {
      console.log(`  • Retrieved ${analysisRows.length} rows for analysis`);

      // Calculate average satisfaction score
      const satisfactionScores = analysisRows
        .map((row) => row.data.satisfaction_score as number)
        .filter((score) => score != null);

      if (satisfactionScores.length > 0) {
        const avgSatisfaction =
          satisfactionScores.reduce((a, b) => a + b, 0) /
          satisfactionScores.length;
        console.log(
          `  • Average satisfaction score: ${avgSatisfaction.toFixed(2)}/5`,
        );
      }

      // Calculate average response time
      const responseTimes = analysisRows
        .map((row) => row.data.response_time_ms as number)
        .filter((time) => time != null);

      if (responseTimes.length > 0) {
        const avgResponseTime =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        console.log(
          `  • Average response time: ${avgResponseTime.toFixed(0)}ms`,
        );
      }

      // Show sample interactions
      console.log("\n📋 Sample interactions:");
      analysisRows.slice(0, 3).forEach((row, index) => {
        console.log(`  ${index + 1}. User: "${row.data.prompt}"`);
        console.log(
          `     Response: "${String(row.data.response).substring(0, 80)}..."`,
        );
        console.log(`     Satisfaction: ${row.data.satisfaction_score}/5\n`);
      });
    }

    // 7. Get dataset versions (if any exist)
    console.log("📚 Checking dataset versions...");
    try {
      const versions = await dataset.getVersions();
      console.log(`  • Total versions: ${versions.total}`);

      if (versions.versions.length > 0) {
        console.log("  • Available versions:");
        versions.versions.forEach((version) => {
          console.log(
            `    - ${version.version} (published: ${version.publishedAt})`,
          );
        });
      } else {
        console.log("  • No published versions yet");
      }
    } catch (error) {
      console.log(`  ⚠️ Could not retrieve versions: ${error.message}`);
    }

    console.log();

    // 8. Publish the dataset
    console.log("🚀 Publishing dataset...");
    await dataset.publish({
      version: "v1.0",
      description:
        "Initial release of LLM interactions dataset with sample data",
    });

    console.log(
      `✅ Dataset published! Status: ${dataset.published ? "Published" : "Draft"}\n`,
    );

    // 9. List all datasets (to show our new one)
    console.log("📑 Listing all datasets...");
    const datasetsList = await client.datasets.list(1, 5); // First 5 datasets
    console.log(`  • Found ${datasetsList.total} total datasets`);
    console.log("  • Recent datasets:");

    datasetsList.datasets.slice(0, 3).forEach((ds, index) => {
      const isOurDataset = ds.id === dataset.id;
      console.log(
        `    ${index + 1}. ${ds.name}${isOurDataset ? " ← (just created!)" : ""}`,
      );
      console.log(`       Description: ${ds.description || "No description"}`);
      console.log(`       Published: ${ds.published ? "Yes" : "No"}\n`);
    });

    // 10. Demonstrate dataset retrieval
    console.log("🔎 Testing dataset retrieval...");
    const retrievedDataset = await client.datasets.get(dataset.slug);
    if (retrievedDataset) {
      console.log(
        `✅ Retrieved dataset by slug: ${retrievedDataset.name} (ID: ${retrievedDataset.id})`,
      );
    } else {
      console.log("❌ Could not retrieve dataset");
    }

    console.log("\n🎉 Dataset API demonstration completed successfully!");
    console.log("\n💡 Key features demonstrated:");
    console.log("   • Dataset creation and schema definition");
    console.log("   • Real-time data collection from LLM interactions");
    console.log("   • CSV data import capabilities");
    console.log("   • Statistical analysis of collected data");
    console.log("   • Dataset publishing and version management");
    console.log("   • Search and retrieval operations");

    console.log(`\n📊 Dataset Summary:`);
    console.log(`   • Name: ${dataset.name}`);
    console.log(`   • ID: ${dataset.id}`);
    console.log(`   • Published: ${dataset.published ? "Yes" : "No"}`);
    console.log(`   • Total interactions recorded: ${rows.length}`);
  } catch (error) {
    console.error("❌ Error in dataset operations:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
};

// Error handling for the main function
main().catch((error) => {
  console.error("💥 Application failed:", error.message);
  process.exit(1);
});
