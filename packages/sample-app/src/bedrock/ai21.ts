import * as traceloop from "@traceloop/node-server-sdk";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

traceloop.initialize({
  appName: "sample_bedrock_ai21",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

// Create a BedrockRuntimeClient with your configuration
const client = new BedrockRuntimeClient();

const prompt = "How do you say Good Morning in French?";

const input = {
  modelId: "ai21.j2-ultra-v1",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    prompt,
    maxTokens: 200,
    temperature: 0.7,
    topP: 1,
    stopSequences: [],
    presencePenalty: { scale: 0 },
    frequencyPenalty: { scale: 0 },
  }),
};

async function generateTextContent() {
  return await traceloop.withWorkflow(
    { name: "sample_completion" },
    async () => {
      // Create an InvokeModelCommand with the input parameters
      const command = new InvokeModelCommand(input);

      // Send the command to invoke the model and await the response
      client.send(command).then((response) => {
        // Save the raw response
        const rawRes = response.body;

        // Convert it to a JSON String
        const jsonString = new TextDecoder().decode(rawRes);

        // Parse the JSON string
        const parsedResponse = JSON.parse(jsonString);

        console.log(">>> non-stream", parsedResponse);
      });
    },
  );
}

traceloop.withAssociationProperties({}, async () => {
  await generateTextContent();
});
