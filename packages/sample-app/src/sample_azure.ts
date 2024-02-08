import * as traceloop from "@traceloop/node-server-sdk";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

traceloop.initialize({
  appName: "sample_openai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const client = new OpenAIClient(
  `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/`,
  new AzureKeyCredential(process.env.AZURE_API_KEY!),
);

async function chat() {
  return await traceloop.withWorkflow("sample_chat", {}, async () => {
    const chatCompletion = await client.getChatCompletions(
      process.env.AZURE_DEPLOYMENT_ID!,
      [{ role: "user", content: "Tell me a joke about OpenTelemetry" }],
    );

    return chatCompletion.choices[0].message?.content;
  });
}

async function completion(jokeSubject: string) {
  return await traceloop.withWorkflow(
    "sample_completion",
    {},
    async () => {
      const completion = await client.getCompletions(
        process.env.AZURE_DEPLOYMENT_ID!,
        [`Tell me a joke about ${jokeSubject}`],
      );

      return completion.choices[0].text;
    },
    { jokeSubject },
  );
}

traceloop.withAssociationProperties({ userId: "12345" }, async () => {
  const chatResponse = await chat();
  console.log(chatResponse);

  const completionResponse = await completion("Typescript");
  console.log(completionResponse);
});
