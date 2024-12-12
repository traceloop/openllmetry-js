// import * as traceloop from "@traceloop/node-server-sdk";
// import { ChromaClient, IncludeEnum, OpenAIEmbeddingFunction } from "chromadb";
// import OpenAI from "openai";
// import fs from "fs";
// import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// const openai_client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// const client = new ChromaClient();

// traceloop.initialize({
//   appName: "sample_chromadb",
//   apiKey: process.env.TRACELOOP_API_KEY,
//   disableBatch: true,
// });

// const embeddingFunction = new OpenAIEmbeddingFunction({
//   openai_api_key: process.env.OPENAI_API_KEY ?? "",
// });

// const scifactCorpusCollection = client.getOrCreateCollection({
//   name: "scifact_corpus",
//   embeddingFunction,
// });

// const claimData = fs
//   .readFileSync("data/scifact/scifact_claims.jsonl")
//   .toString()
//   .split("\n")
//   .map((each) => {
//     try {
//       return JSON.parse(each);
//     } catch (e) {
//       // Continue
//     }
//   });
// const corpusData = fs
//   .readFileSync("data/scifact/scifact_corpus.jsonl")
//   .toString()
//   .split("\n")
//   .map((each) => {
//     try {
//       return JSON.parse(each);
//     } catch (e) {
//       // Continue
//     }
//   });

// const batchSize = 100;

// async function processData() {
//   for (let i = 0; i < corpusData.length; i += batchSize) {
//     const batchData = corpusData.slice(i, i + batchSize);
//     for (const row of batchData) {
//       (await scifactCorpusCollection).add({
//         ids: row["doc_id"].toString(),
//         documents: `${row["title"]}. ${row["abstract"].join(" ")}`,
//         metadatas: { structured: row["structured"] },
//       });
//     }
//   }
// }

// processData().then(() => null);

// const buildPromptWithContext = (
//   claim: any,
//   context: any,
// ): ChatCompletionMessageParam[] => [
//   {
//     role: "system",
//     content:
//       "I will ask you to assess whether a particular scientific claim, based on evidence provided. " +
//       "Output only the text 'True' if the claim is true, 'False' if the claim is false, or 'NEE' if there's " +
//       "not enough evidence.",
//   },
//   {
//     role: "user",
//     content: `
// The evidence is the following:

// ${context.join(" ")}

// Assess the following claim on the basis of the evidence. Output only the text 'True' if the claim is true,
// 'False' if the claim is false, or 'NEE' if there's not enough evidence. Do not output any other text.

// Claim:
// ${claim}

// Assessment:
// `,
//   },
// ];

// async function assessClaims(claims: any) {
//   const claimQueryResult = await (
//     await scifactCorpusCollection
//   ).query({
//     queryTexts: claims,
//     include: [IncludeEnum.Documents, IncludeEnum.Distances],
//     nResults: 3,
//   });
//   const responses = [];

//   for (let i = 0; i < claimQueryResult.documents.length; i++) {
//     const claim = claims[i];
//     const context = claimQueryResult.documents[i];
//     if (context.length === 0) {
//       responses.push("NEE");
//       continue;
//     }

//     const response = await openai_client.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: buildPromptWithContext(claim, context),
//       max_tokens: 3,
//     });

//     const formattedResponse = response.choices[0].message.content?.replace(
//       "., ",
//       "",
//     );
//     console.log("Claim: ", claim);
//     console.log("Response: ", formattedResponse);
//     responses.push(formattedResponse);
//   }

//   return responses;
// }

// traceloop.withAssociationProperties({}, async () => {
//   const samples = claimData.slice(0, 2); // Get a sample of 2 claims
//   assessClaims(samples.map((sample) => sample["claim"]));
// });
