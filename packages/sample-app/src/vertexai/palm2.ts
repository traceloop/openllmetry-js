import * as traceloop from "@traceloop/node-server-sdk";
import * as aiplatform from "@google-cloud/aiplatform";
import { google } from "@google-cloud/aiplatform/build/protos/protos";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";

traceloop.initialize({
  appName: "sample_vertexai_palm2",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  exporter: new ConsoleSpanExporter(),
});

const project = process.env.VERTEXAI_PROJECT_ID ?? "";
const location = process.env.VERTEXAI_LOCATION ?? "";

// Imports the Google Cloud Prediction service client
const { PredictionServiceClient } = aiplatform.v1;

// Import the helper module for converting arbitrary protobuf.Value objects.
const { helpers } = aiplatform;

// Instantiates a client
const predictionServiceClient = new PredictionServiceClient({
  apiEndpoint: "us-central1-aiplatform.googleapis.com",
});

// async function callPredictForText(
//   publisher = "google",
//   model = "text-bison@001",
// ) {
//   // Configure the parent resource
//   const endpoint = `projects/${project}/locations/${location}/publishers/${publisher}/models/${model}`;

//   const prompt = {
//     prompt: "What are the cardinal directions?",
//   };
//   const instanceValue = helpers.toValue(prompt);
//   const instances = [instanceValue] as google.protobuf.IValue[];

//   const parameter = {
//     temperature: 0.2,
//     maxOutputTokens: 256,
//     topP: 0.95,
//     topK: 40,
//   };
//   const parameters = helpers.toValue(parameter);

//   const request = {
//     endpoint,
//     instances,
//     parameters,
//   };

//   // Predict request
//   const response = await predictionServiceClient.predict(request);
//   // console.log(response[0]?.predictions?.[0]?.structValue?.fields);

//   const res = new google.cloud.aiplatform.v1.PredictResponse(response[0]);
//   console.log(res.deployedModelId);
//   console.log(
//     res.toJSON().predictions[0].structValue.fields.content.stringValue,
//   );
//   // console.log(google.cloud.aiplatform.v1.PredictResponse.toObject(res));
// }

async function callPredictForChat(
  publisher = "google",
  model = "chat-bison@001",
) {
  // Configure the parent resource
  const endpoint = `projects/${project}/locations/${location}/publishers/${publisher}/models/${model}`;

  const prompt = {
    context:
      "My name is Miles. You are an astronomer, knowledgeable about the solar system.",
    examples: [
      {
        input: { content: "How many moons does Mars have?" },
        output: {
          content: "The planet Mars has two moons, Phobos and Deimos.",
        },
      },
    ],
    messages: [
      {
        author: "user",
        content: "How many planets are there in the solar system?",
      },
    ],
  };
  const instanceValue = helpers.toValue(prompt);
  const instances = [instanceValue] as google.protobuf.IValue[];

  const parameter = {
    temperature: 0.2,
    maxOutputTokens: 256,
    topP: 0.95,
    topK: 40,
  };
  const parameters = helpers.toValue(parameter);

  const request = {
    endpoint,
    instances,
    parameters,
  };

  const [response] = await predictionServiceClient.predict(request);
  const predictions = response.predictions;
  if (predictions?.length)
    for (const prediction of predictions) {
      console.log(
        JSON.stringify(
          prediction.structValue?.fields?.candidates.listValue?.values?.[0]
            ?.structValue?.fields?.content.stringValue,
        ),
      );
    }
}

traceloop.withAssociationProperties({}, async () => {
  await callPredictForChat();
});
