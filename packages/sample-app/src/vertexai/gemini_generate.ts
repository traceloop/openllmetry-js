import * as traceloop from "@traceloop/node-server-sdk";
import { VertexAI } from "@google-cloud/vertexai";
// import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";

traceloop.initialize({
  appName: "sample_vertexai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  // exporter: new ConsoleSpanExporter(),
});

// Initialize Vertex with your Cloud project and location
const vertexAI = new VertexAI({
  project: process.env.VERTEXAI_PROJECT_ID ?? "",
  location: process.env.VERTEXAI_LOCATION ?? "",
});

async function createNonStreamingContent() {
  return await traceloop.withWorkflow("sample_completion", {}, async () => {
    // Instantiate the model
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: "gemini-pro-vision",
    });

    const request = {
      contents: [{ role: "user", parts: [{ text: "What is Node.js?" }] }],
    };

    // Create the response stream
    const responseStream = await generativeModel.generateContent(request);

    // Wait for the response stream to complete
    const aggregatedResponse = await responseStream.response;

    // Select the text from the response
    const fullTextResponse =
      aggregatedResponse.candidates[0].content.parts[0].text;

    return fullTextResponse;
  });
}

traceloop.withAssociationProperties({}, async () => {
  const completionResponse = await createNonStreamingContent();
  console.log(completionResponse);
});
