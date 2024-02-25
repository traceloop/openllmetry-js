import * as traceloop from "@traceloop/node-server-sdk";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

traceloop.initialize({
  appName: "sample_bedrock_anthropic",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

// Create a BedrockRuntimeClient with your configuration
const client = new BedrockRuntimeClient();

const prompt = `What are the 4 cardinal directions?`;

const input = {
  // You can change the modelId
  // "anthropic.claude-v1"
  // "anthropic.claude-instant-v1"
  // "anthropic.claude-v2"
  modelId: "anthropic.claude-v2",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    prompt: `\n\nHuman:${prompt}\n\nAssistant:`,
    max_tokens_to_sample: 300,
    temperature: 0.5,
    top_k: 250,
    top_p: 1,
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

async function generateTextContentWithStreaming() {
  return await traceloop.withWorkflow(
    { name: "sample_stream_completion" },
    async () => {
      // Create an InvokeModelWithResponseStreamCommand with the input parameters
      const command = new InvokeModelWithResponseStreamCommand(input);

      // Send the command to invoke the model and await the response
      const response = await client.send(command);

      // Save the raw response
      const rawRes = response.body;

      if (rawRes) {
        for await (const value of rawRes) {
          // Convert it to a JSON String
          const jsonString = new TextDecoder().decode(value.chunk?.bytes);

          // Parse the JSON string
          const parsedResponse = JSON.parse(jsonString);

          console.log(">>> streamed part", parsedResponse);
        }
      }
    },
  );
}

traceloop.withAssociationProperties({}, async () => {
  await generateTextContent();
  await generateTextContentWithStreaming();
});
