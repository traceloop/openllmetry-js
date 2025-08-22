import * as traceloop from "@traceloop/node-server-sdk";
import { OpenAI } from "openai";
import { provideMedicalInfoPrompt } from "./medical_prompts";
import type { ExperimentTaskFunction, TaskResponse } from "@traceloop/node-server-sdk";

const main = async () => {
  console.log("Starting sample experiment");
  // Initialize Traceloop SDK
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

  // Initialize OpenAI client
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
  const medicalTaskRefuseAdvice: ExperimentTaskFunction = async (row: Record<string, any>): Promise<Record<string, any>> => {
    // const promptText = refuseMedicalAdvicePrompt(row.question);
    // const answer = await generateMedicalAnswer(promptText);
    
    return {
      completion: "answer",
      prompt: "promptText",
    };
  };

  /**
   * Task function for providing medical info prompt  
   */
  const medicalTaskProvideInfo: ExperimentTaskFunction = async (row: any): Promise<any> => {
    const promptText = provideMedicalInfoPrompt(row.question);
    const answer = await generateMedicalAnswer(promptText);
    
    return {
      completion: answer,
      prompt: promptText,
      strategy: "provide_info"
    };
  };

  try {
    console.log("\n🧪 Running experiment with clinical guidance prompt (refuses medical advice)...");
    
    const results1 = await client.
    experiment.run(medicalTaskRefuseAdvice, {
      datasetSlug: "medical-q",
      datasetVersion: "v1",
      evaluators: [{ name: "medical_advice" }],
      experimentSlug: "medical-advice-exp-ts",
      stopOnError: false,
      waitForResults: true,
    });

    console.log(`✅ Completed refuse advice experiment:`);
    console.log(`   - Results: ${results1.results.length}`);
    console.log(`   - Errors: ${results1.errors.length}`);
    console.log(`   - Experiment ID: ${results1.experimentId}`);

    console.log("\n🧪 Running experiment with comprehensive medical info prompt...");
    
    const results2 = await client.experiment.run(medicalTaskProvideInfo, {
      datasetSlug: "medical-q", 
      datasetVersion: "v1",
      evaluators: [{ name: "medical_advice" }],
      experimentSlug: "medical-advice-exp-ts", 
      stopOnError: false,
      waitForResults: true,
    });

    console.log(`✅ Completed provide info experiment:`);
    console.log(`   - Results: ${results2.results.length}`);
    console.log(`   - Errors: ${results2.errors.length}`);
    console.log(`   - Experiment ID: ${results2.experimentId}`);

    // Compare results
    console.log("\n📊 Experiment Comparison:");
    console.log("Refuse Advice Strategy:");
    results1.results.slice(0, 2).forEach((result: TaskResponse, i: number) => {
      console.log(`  Sample ${i + 1}:`);
      console.log(`    Question: ${result.input?.question || 'N/A'}`);
      console.log(`    Response: ${result.output?.completion?.substring(0, 100) || 'N/A'}...`);
    });

    console.log("\nProvide Info Strategy:");
    results2.results.slice(0, 2).forEach((result: TaskResponse, i: number) => {
      console.log(`  Sample ${i + 1}:`);
      console.log(`    Question: ${result.input?.question || 'N/A'}`);
      console.log(`    Response: ${result.output?.completion?.substring(0, 100) || 'N/A'}...`);
    });

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
