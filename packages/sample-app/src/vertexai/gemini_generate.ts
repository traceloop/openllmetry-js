import * as traceloop from "@traceloop/node-server-sdk";
import { VertexAI } from "@google-cloud/vertexai";

traceloop.initialize({
  appName: "sample_vertexai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

async function createNonStreamingContent() {
  // Initialize Vertex with your Cloud project and location
  const vertexAI = new VertexAI({
    project: process.env.VERTEXAI_PROJECT_ID ?? "",
    location: process.env.VERTEXAI_LOCATION ?? "",
  });

  // Instantiate the model
  const generativeModel = vertexAI.preview.getGenerativeModel({
    model: "gemini-pro-vision",
  });

  const request = {
    contents: [{ role: "user", parts: [{ text: "What is Node.js?" }] }],
  };

  console.log("Prompt:");
  console.log(request.contents[0].parts[0].text);
  console.log("Non-Streaming Response Text:");

  // Create the response stream
  const responseStream = await generativeModel.generateContent(request);

  // Wait for the response stream to complete
  const aggregatedResponse = await responseStream.response;

  // Select the text from the response
  const fullTextResponse =
    aggregatedResponse.candidates[0].content.parts[0].text;

  console.log(fullTextResponse);
}

createNonStreamingContent().catch((err) => {
  console.error(err.message);
});
