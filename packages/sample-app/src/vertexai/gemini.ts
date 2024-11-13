import * as traceloop from "@traceloop/node-server-sdk";
import { VertexAI } from "@google-cloud/vertexai";

traceloop.initialize({
  appName: "sample_vertexai_gemini",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

// Initialize Vertex with your Cloud project and location
const vertexAI = new VertexAI({
  project: process.env.VERTEXAI_PROJECT_ID ?? "",
  location: process.env.VERTEXAI_LOCATION ?? "",
});

async function createNonStreamingContent() {
  return await traceloop.withWorkflow(
    { name: "sample_completion" },
    async () => {
      // Instantiate the model
      const generativeModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: {
          role: "system",
          parts: [{ text: "You are a helpful assistant" }],
        },
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What are the 4 cardinal directions?" }],
          },
        ],
      };

      // Create the response stream
      const responseStream = await generativeModel.generateContent(request);

      // Wait for the response stream to complete
      const aggregatedResponse = await responseStream.response;

      // Select the text from the response
      const fullTextResponse =
        aggregatedResponse.candidates![0].content.parts[0].text;

      return fullTextResponse;
    },
  );
}

async function createStreamingContent() {
  return await traceloop.withWorkflow(
    { name: "sample_stream_completion" },
    async () => {
      // Instantiate the model
      const generativeModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: {
          role: "system",
          parts: [{ text: "You are a helpful assistant" }],
        },
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What are the 4 cardinal directions?" }],
          },
        ],
      };

      // Create the response stream
      const responseStream =
        await generativeModel.generateContentStream(request);

      // Wait for the response stream to complete
      const aggregatedResponse = await responseStream.response;

      // Select the text from the response
      const fullTextResponse =
        aggregatedResponse.candidates![0].content.parts[0].text;

      return fullTextResponse;
    },
  );
}

traceloop.withAssociationProperties({}, async () => {
  console.log(await createNonStreamingContent());
  console.log(await createStreamingContent());
});
