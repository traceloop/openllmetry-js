import * as traceloop from "@traceloop/node-server-sdk";
import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

traceloop.initialize({
  appName: "sample_openai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const scope = "https://cognitiveservices.azure.com/.default";
const azureADTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), scope);

const client = new AzureOpenAI({
  endpoint: `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/`,
  deployment: process.env.AZURE_DEPLOYMENT_ID!,
  apiVersion: "2024-02-01",
  azureADTokenProvider,
});

async function chat() {
  return await traceloop.withWorkflow({ name: "sample_chat" }, async () => {
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: "user", content: "Tell me a joke about OpenTelemetry" }],
      model: process.env.AZURE_DEPLOYMENT_ID!, // deployment name
    });

    return chatCompletion.choices[0].message?.content;
  });
}

traceloop.withAssociationProperties({ userId: "12345" }, async () => {
  const chatResponse = await chat();
  console.log(chatResponse);
});
