import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { createSpanProcessor } from "@traceloop/node-server-sdk";
import { trace } from "@opentelemetry/api";

// Initialize the OpenTelemetry SDK with Traceloop's span processor
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "my-sample-app",
  }),
  spanProcessors: [
    createSpanProcessor({
      apiKey: process.env.TRACELOOP_API_KEY,
      baseUrl: process.env.TRACELOOP_BASE_URL,
      // Optional: disable batching for development
      disableBatch: process.env.NODE_ENV === "development",
    }),
  ],
});

// Start the SDK
sdk.start();

// Your application code here
async function main() {
  // Example: Create a trace
  const tracer = trace.getTracer("my-sample-app");
  
  const span = tracer.startSpan("main");
  try {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Add some attributes that Traceloop's span processor will handle
    span.setAttribute("ai.prompt.messages", JSON.stringify([
      { role: "user", content: "Hello, AI!" }
    ]));
    
    span.end();
  } catch (error) {
    span.recordException(error);
    span.end();
  }
}

// Run the app
main().then(() => {
  // Gracefully shut down the SDK
  sdk.shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
