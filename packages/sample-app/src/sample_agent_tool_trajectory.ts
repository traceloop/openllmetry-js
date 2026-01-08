/**
 * Agent Tool Trajectory Experiment
 *
 * This example demonstrates Traceloop's agent tool trajectory evaluator:
 * - Agent Tool Trajectory: Validates the agent tool trajectory
 *
 * This evaluator helps ensure your AI agents perform optimally and follow the expected tool trajectory.
 */

import * as traceloop from "@traceloop/node-server-sdk";
import type {
  ExperimentTaskFunction,
  TaskInput,
  TaskOutput,
} from "@traceloop/node-server-sdk";

import "dotenv/config";

const main = async () => {
  console.log("Agent Tool Trajectory Experiment\n");

  traceloop.initialize({
    appName: "agent_tool_trajectory_experiment",
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

  /**
   * Task function for agent tool trajectory evaluation
   */
  const agentEvaluatorsTask: ExperimentTaskFunction = async (
    row: TaskInput,
  ): Promise<TaskOutput> => {
    const executedToolCalls = (row.actual as string) || "";
    const defaultExpected =
      "[{'name': 'search', 'input': {'query': 'weather'}}, " +
      "{'name': 'book_flight', 'input': {'flight': 'NYC to Paris'}}, " +
      "{'name': 'get_confirmation', 'input': {'confirmation': 'flight booked'}}]";
    const expectedToolCalls = (row.expected as string) || defaultExpected;

    return {
      executed_tool_calls: executedToolCalls,
      expected_tool_calls: expectedToolCalls,
    };
  };

  console.log("\n" + "=".repeat(80));
  console.log("AGENT TOOL TRAJECTORY EXPERIMENT");
  console.log("=".repeat(80) + "\n");
  console.log(
    "This experiment will test the agent tool trajectory with the agent tool trajectory evaluator:\n",
  );
  console.log("1. Agent Tool Trajectory - Validates the agent tool trajectory");
  console.log("\n" + "-".repeat(80) + "\n");

  // Configure agent evaluators
  // Using the evaluator slug directly - TypeScript should infer it's valid
  const evaluators = [
    {
      name: "agent-tool-trajectory",
      config: {
        input_params_sensitive: true,
        mismatch_sensitive: false,
        order_sensitive: false,
        threshold: 0.7,
      },
    },
  ];

  console.log("Running experiment with evaluators:");
  evaluators.forEach((evaluator) => {
    console.log(`  - ${evaluator.name}`);
  });

  console.log("\n" + "-".repeat(80) + "\n");

  try {
    // Run the experiment
    // Note: You'll need to create a dataset with appropriate test cases for agents
    const result = await client.experiment.run(agentEvaluatorsTask, {
      datasetSlug: "agent-tool-trajectory", // Set a dataset slug that exists in the traceloop platform
      datasetVersion: "v1",
      evaluators,
      experimentSlug: "agent-tool-trajectory-exp",
      stopOnError: false,
      waitForResults: true,
    });

    console.log("\n" + "=".repeat(80));
    console.log("Agent tool trajectory experiment completed!");
    console.log("=".repeat(80) + "\n");

    if ("taskResults" in result) {
      console.log("Results summary:");
      console.log(`  - Total rows processed: ${result.taskResults.length}`);
      console.log(`  - Errors encountered: ${result.errors.length}`);
      console.log(`  - Experiment ID: ${result.experimentId}`);

      if (result.errors.length > 0) {
        console.log("\nErrors:");
        result.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
      }
    }
  } catch (error) {
    console.error(
      "❌ Error in experiment operations:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
};

// Error handling for the main function
main().catch((error) => {
  console.error("💥 Application failed:", error.message);
  process.exit(1);
});
