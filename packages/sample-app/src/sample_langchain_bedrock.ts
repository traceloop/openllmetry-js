import "dotenv/config";
import * as traceloop from "@traceloop/node-server-sdk";

traceloop.initialize({
  appName: "sample_langchain_bedrock", 
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  logLevel: "debug",
});

import { BedrockChat } from "@langchain/community/chat_models/bedrock";
import { HumanMessage } from "@langchain/core/messages";


async function main() {
  const model = new BedrockChat({
    model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    region: "us-east-1"
  });

  const message = new HumanMessage({
    content: "Tell me a joke about opentelemetry",
  });

  console.log("About to invoke BedrockChat...");
  const response = await model.invoke([message]);
  console.log("Response received:", response);
  
  // Wait for spans to be exported
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log("Done waiting for spans");
}

void main().then(() => {
  console.log("Done");
});
