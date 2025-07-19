import { NodeSDK } from "@opentelemetry/sdk-node";
import * as traceloop from "@traceloop/node-server-sdk";
import { trace } from "@opentelemetry/api";
import OpenAI from "openai";

traceloop.initialize({
  tracingEnabled: false,
  traceloopSyncEnabled: false,
});

const traceloopSpanProcessor = traceloop.createSpanProcessor({
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
  allowedInstrumentationLibraries: ["my-sample-app"],
});

// Initialize the OpenTelemetry SDK with Traceloop's span processor
const sdk = new NodeSDK({
  spanProcessors: [traceloopSpanProcessor],
});
const openai = new OpenAI();

sdk.start();

async function main() {
  const tracer = trace.getTracer("my-sample-app");

  return tracer.startActiveSpan("main.method", async (span) => {
    try {
      const chatResponse = await chat();
      console.log(chatResponse);
      return chatResponse;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

async function chat() {
  return await traceloop.withWorkflow({ name: "sample_chat" }, async () => {
    return await traceloop.withTask({ name: "parent_task" }, async () => {
      return await traceloop.withTask({ name: "child_task" }, async () => {
        const chatCompletion = await openai.chat.completions.create({
          messages: [
            { role: "user", content: "Tell me a joke about OpenTelemetry" },
          ],
          model: "gpt-3.5-turbo",
          logprobs: true,
        });

        return chatCompletion.choices[0].message.content;
      });
    });
  });
}

main()
  .then(() => {
    sdk
      .shutdown()
      .catch((error) => console.log("Error terminating application", error))
      .finally(() => process.exit(0));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
