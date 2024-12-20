import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

traceloop.initialize({
  appName: "sample_vercel_ai",
  disableBatch: true,
});

async function chat(question: string) {
  return await traceloop.withWorkflow(
    { name: "chat" },
    async () => {
      const chatCompletion = await generateText({
        messages: [{ role: "user", content: question }],
        model: openai("gpt-3.5-turbo"),
        experimental_telemetry: { isEnabled: true },
      });

      return chatCompletion.text;
    },
    { question },
  );
}

chat("What is the capital of France?");
