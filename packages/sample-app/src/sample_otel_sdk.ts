import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  createSpanProcessor,
  withTask,
  withWorkflow,
} from "@traceloop/node-server-sdk";
import { trace } from "@opentelemetry/api";
import OpenAI from "openai";

const traceloopSpanProcessor = createSpanProcessor({
  apiKey: process.env.TRACELOOP_API_KEY,
  baseUrl: process.env.TRACELOOP_BASE_URL,
  disableBatch: true,
});

// Initialize the OpenTelemetry SDK with Traceloop's span processor
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "my-sample-app",
  }),
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
  return await withWorkflow({ name: "sample_chat" }, async () => {
    return await withTask({ name: "parent_task" }, async () => {
      return await withTask({ name: "child_task" }, async () => {
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
