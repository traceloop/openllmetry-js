import { ChatBedrockConverse } from "@langchain/aws";
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "sample_langchain_bedrock",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

async function main() {
  const model = new ChatBedrockConverse({
    model: "anthropic.claude-3-haiku-20240307-v1:0",
  });

  const response = await model.invoke("Tell me a joke about opentelemetry");
  console.log(response);
}

void main().then(() => {
  console.log("Done");
});
