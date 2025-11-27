import * as traceloop from "@traceloop/node-server-sdk";
import { OpenAI } from "openai";
import type {
  ExperimentTaskFunction,
  TaskInput,
  TaskOutput,
} from "@traceloop/node-server-sdk";

import "dotenv/config";

const main = async () => {
  console.log("Starting GitHub experiment sample");
  traceloop.initialize({
    appName: "sample_github_experiment",
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
    console.error("Initialization error details:", error);
    process.exit(1);
  }

  const client = traceloop.getClient();
  if (!client) {
    console.error("Failed to initialize Traceloop client");
    return;
  }

  console.log("🚀 GitHub Experiment Sample Application");
  console.log("=======================================\n");

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  /**
   * Example task function that generates a response using OpenAI
   * This will be executed locally in GitHub Actions
   */
  const researchTask: ExperimentTaskFunction = async (
    row: TaskInput,
  ): Promise<TaskOutput> => {
    console.log(`Processing question: ${row.query}`);
    const question = row.query as string;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful research assistant. Provide concise, accurate answers.",
        },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = response.choices?.[0]?.message?.content || "";

    return {
      question,
      sentence: answer,
      completion: answer,
    };
  };

  try {
    console.log("\n🧪 Running experiment...");
    console.log(
      "   If in GitHub Actions, will run in GitHub context automatically\n",
    );

    const results = await client.experiment.run(researchTask, {
      datasetSlug: "research-queries",
      datasetVersion: "v2",
      evaluators: [
        "research-relevancy",
        "categories",
        "research-facts-counter",
      ],
      experimentSlug: "research-ts",
    });

    console.log("\n✅ Experiment completed successfully!");
    console.log("Results:", JSON.stringify(results, null, 2));

    // Check if this is a GitHub response (has experimentSlug but not taskResults)
    if ("taskResults" in results) {
      // Local execution result
      console.log(`\n   - Task Results: ${results.taskResults.length}`);
      console.log(`   - Errors: ${results.errors.length}`);
      if (results.experimentId) {
        console.log(`   - Experiment ID: ${results.experimentId}`);
      }
    } else {
      // GitHub execution result
      console.log(
        "\n💡 Results will be posted as a comment on the pull request by the backend",
      );
    }
  } catch (error) {
    console.error(
      "\n❌ Error in GitHub experiment:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
};

// Error handling for the main function
main().catch((error) => {
  console.error("💥 Application failed:", error.message);
  process.exit(1);
});
