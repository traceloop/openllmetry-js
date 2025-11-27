import * as traceloop from "@traceloop/node-server-sdk";
import { OpenAI } from "openai";
import { provideMedicalInfoPrompt } from "./medical_prompts";
import { refuseMedicalAdvicePrompt } from "./medical_prompts";
import type {
  ExperimentTaskFunction,
  TaskInput,
  TaskOutput,
} from "@traceloop/node-server-sdk";

import "dotenv/config";

const main = async () => {
  console.log("Starting sample experiment");
  traceloop.initialize({
    appName: "sample_experiment",
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

  console.log("🚀 Experiment API Sample Application");
  console.log("====================================\n");

  //Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  /**
   * Generate a medical answer using OpenAI and the provided prompt
   */
  async function generateMedicalAnswer(promptText: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: promptText }],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices?.[0]?.message?.content || "";
  }

  /**
   * Task function for refusing medical advice prompt
   */
  const medicalTaskRefuseAdvice: ExperimentTaskFunction = async (
    row: TaskInput,
  ): Promise<TaskOutput> => {
    const promptText = refuseMedicalAdvicePrompt(row.question as string);
    const answer = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: promptText }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const completion = answer.choices?.[0]?.message?.content || "";

    return {
      completion: completion,
      prompt: promptText,
      answer: completion,
    };
  };

  /**
   * Task function for providing medical info prompt
   */
  const medicalTaskProvideInfo: ExperimentTaskFunction = async (
    row: TaskInput,
  ): Promise<TaskOutput> => {
    const promptText = provideMedicalInfoPrompt(row.question as string);
    const answer = await generateMedicalAnswer(promptText);

    return {
      completion: answer,
      prompt: promptText,
      answer,
    };
  };

  // Simple loader utility
  const startLoader = (message: string) => {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    process.stdout.write(`\n${message} `);
    return setInterval(() => {
      process.stdout.write(`\r${message} ${frames[i++ % frames.length]}`);
    }, 100);
  };

  const stopLoader = (interval: NodeJS.Timeout, successMessage: string) => {
    clearInterval(interval);
    process.stdout.write(`\r${successMessage}\n`);
  };

  try {
    console.log(
      "\n🧪 Running experiment with clinical guidance prompt (refuses medical advice)...",
    );

    const loader1 = startLoader("   Processing experiment");

    const results1 = await client.experiment.run(medicalTaskRefuseAdvice, {
      datasetSlug: "ai-doctor-dataset",
      datasetVersion: "v1",
      evaluators: ["Medical Advice Given"],
      experimentSlug: "medical-advice-experiment",
      stopOnError: false,
    });

    stopLoader(loader1, "   ✅ Experiment completed");

    if ("taskResults" in results1) {
      console.log(`✅ Completed refuse advice experiment:`);
      console.log(`   - Results: ${results1.taskResults.length}`);
      console.log(`   - Errors: ${results1.errors.length}`);
      console.log(`   - Experiment ID: ${results1.experimentId}`);
      console.log("Evaluation Results:", results1.evaluations);
    }

    console.log(
      "\n🧪 Running experiment with comprehensive medical info prompt...",
    );

    const loader2 = startLoader("   Processing experiment");

    const results2 = await client.experiment.run(medicalTaskProvideInfo, {
      datasetSlug: "ai-doctor-dataset",
      datasetVersion: "v1",
      evaluators: ["Medical Advice Given"],
      experimentSlug: "medical-advice-experiment",
      stopOnError: false,
      waitForResults: true,
    });

    stopLoader(loader2, "   ✅ Experiment completed");
    if ("taskResults" in results2) {
      console.log(`✅ Completed provide info experiment:`);
      console.log(`   - Results: ${results2.taskResults.length}`);
      console.log(`   - Errors: ${results2.errors.length}`);
      console.log(`   - Experiment ID: ${results2.experimentId}`);
      console.log("Evaluation Results:", results2.evaluations);
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
