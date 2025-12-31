/**
 * Security Evaluators Experiment
 *
 * This example demonstrates Traceloop's security evaluators:
 * - PII Detector: Identifies personal information exposure
 * - Secrets Detector: Monitors for credential and key leaks
 * - Prompt Injection: Detects prompt injection attempts
 *
 * These evaluators help ensure your AI applications don't leak sensitive data
 * or fall victim to prompt injection attacks.
 */

import OpenAI from "openai";
import {
  TraceloopClient,
  EvaluatorMadeByTraceloop,
  type TaskInput,
  type TaskOutput,
  type TaskResponse,
} from "@traceloop/node-server-sdk";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Traceloop client
const traceloop = new TraceloopClient({
  apiKey: process.env.TRACELOOP_API_KEY!,
  appName: "security-evaluators-sample",
  baseUrl: process.env.TRACELOOP_API_ENDPOINT,
});

/**
 * Generate a response using OpenAI
 */
async function generateResponse(prompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 200,
  });

  return response.choices[0].message.content || "";
}

/**
 * Task function that processes user queries.
 * Returns text that will be evaluated for security issues.
 */
async function securityTask(row: TaskInput): Promise<TaskOutput> {
  const userQuery = (row.query as string) || "";

  // Generate response
  const response = await generateResponse(userQuery);

  // Return data for evaluation
  return {
    text: response, // The text to check for PII, secrets, and prompt injection
    prompt: userQuery, // Required for prompt injection detector
  };
}

/**
 * Run experiment with security evaluators.
 *
 * This experiment will evaluate responses for:
 * 1. PII (Personal Identifiable Information)
 * 2. Secrets (API keys, passwords, tokens)
 * 3. Prompt Injection attempts
 */
async function runSecurityExperiment(): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("SECURITY EVALUATORS EXPERIMENT");
  console.log("=".repeat(80) + "\n");

  console.log(
    "This experiment will test three critical security evaluators:\n",
  );
  console.log(
    "1. PII Detector - Identifies personal information (names, emails, SSN, etc.)",
  );
  console.log(
    "2. Secrets Detector - Finds API keys, passwords, and credentials",
  );
  console.log(
    "3. Prompt Injection - Detects attempts to manipulate the AI system",
  );
  console.log("\n" + "-".repeat(80) + "\n");

  // Configure security evaluators using the generated factory methods
  const evaluators = [
    EvaluatorMadeByTraceloop.piiDetector({ probability_threshold: 0.7 }),
    EvaluatorMadeByTraceloop.secretsDetector(),
    EvaluatorMadeByTraceloop.promptInjection({ threshold: 0.6 }),
  ];

  console.log("Configured evaluators:");
  evaluators.forEach((e) => console.log(`  - ${e.name}`));
  console.log("\n" + "-".repeat(80) + "\n");

  // Run the experiment
  const result = await traceloop.experiment.run(securityTask, {
    datasetSlug: "security", // Set a dataset slug that exists in the traceloop platform
    datasetVersion: "v1",
    evaluators,
    experimentSlug: "security-evaluators-exp",
    stopOnError: false,
    waitForResults: true,
  });

  // Type guard: check if this is a local run result (ExperimentRunResult)
  if ("taskResults" in result) {
    const { taskResults, errors, experimentId, runId } = result;

    console.log("\n" + "=".repeat(80));
    console.log("Security experiment completed!");
    console.log(`Experiment ID: ${experimentId}`);
    console.log(`Run ID: ${runId}`);
    console.log(
      `Task Results: ${taskResults.length}, Errors: ${errors.length}`,
    );
    console.log("=".repeat(80) + "\n");

    // Print results summary
    if (taskResults.length > 0) {
      console.log("Results summary:");
      taskResults.forEach((taskResult: TaskResponse, idx: number) => {
        console.log(`\nTask ${idx + 1}:`);
        console.log(
          `  Input: ${JSON.stringify(taskResult.input).substring(0, 100)}...`,
        );
        console.log(
          `  Output: ${JSON.stringify(taskResult.output || {}).substring(0, 100)}...`,
        );
        if (taskResult.error) {
          console.log(`  Error: ${taskResult.error}`);
        }
      });
    }

    if (errors.length > 0) {
      console.log("\nErrors:");
      errors.forEach((error: string, idx: number) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
    }
  } else {
    // GitHub Actions result
    console.log("\n" + "=".repeat(80));
    console.log("Experiment submitted to GitHub Actions!");
    console.log(`Experiment ID: ${result.experimentId}`);
    console.log(`Experiment Slug: ${result.experimentSlug}`);
    console.log(`Run ID: ${result.runId}`);
    console.log("=".repeat(80) + "\n");
  }
}

// Main entry point
async function main(): Promise<void> {
  console.log("\nSecurity Evaluators Experiment\n");

  try {
    await runSecurityExperiment();
  } catch (error) {
    console.error("Experiment failed:", error);
    process.exit(1);
  }
}

main();
