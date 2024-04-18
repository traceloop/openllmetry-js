import * as traceloop from "@traceloop/node-server-sdk";
// import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  ChromaClient,
  // Collection,
  IncludeEnum,
  OpenAIEmbeddingFunction,
  // DeleteCollectionParams,
} from "chromadb";
import OpenAI from "openai";
import fs from "fs";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai_client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = new ChromaClient();

traceloop.initialize({
  appName: "sample_chromadb",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  // exporter: new ConsoleSpanExporter(),
});

const embeddingFunction = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY ?? "",
});

const scifactCorpusCollection = client.getOrCreateCollection({
  name: "scifact_corpus",
  embeddingFunction,
});

// const sampleAdd = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_add" }, async () => {
//     const addedResponse = await collection.add({
//       ids: ["uri9", "uri10"],
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: [{ style: "style1" }, { style: "style2" }],
//       documents: ["doc1000101", "doc288822"],
//     });

//     console.log(addedResponse);
//   });
// };

// const sampleQuery = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_query" }, async () => {
//     const results = await collection.query({
//       nResults: 2,
//       queryEmbeddings: [
//         [1.1, 2.3, 3.2],
//         [5.1, 4.3, 2.2],
//       ],
//       where: { style: "style2" },
//     });

//     console.log(results);
//   });
// };

// const sampleGet = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_get" }, async () => {
//     const result = await collection.get();

//     console.log(result);
//   });
// };

// const sampleModify = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_modify" }, async () => {
//     const result = await collection.modify({
//       name: "my_collection",
//       metadata: { style: "style" },
//     });
//     console.log(result);
//   });
// };

// const samplePeek = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_peek" }, async () => {
//     const result = await collection.peek();
//     console.log(result);
//   });
// };

// const sampleUpdate = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_update" }, async () => {
//     const result = await collection.update({
//       ids: "id1",
//       embeddings: [
//         [1.5, 2.9, 3.4],
//         [9.8, 2.3, 2.9],
//       ],
//       metadatas: { source: "my_source" },
//       documents: "This is a document",
//     });
//     console.log(result);
//   });
// };

// const sampleUpsert = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_upsert" }, async () => {
//     const result = await collection.upsert({
//       ids: "id1",
//       metadatas: { source: "my_source" },
//       documents: "This is a document",
//     });
//     console.log(result);
//   });
// };

// const sampleDelete = async (collection: Collection) => {
//   return await traceloop.withWorkflow({ name: "sample_delete" }, async () => {
//     const result = await collection.delete({
//       ids: "id1",
//     });
//     console.log(result);
//   });
// };

// traceloop.withAssociationProperties({}, async () => {
//   const collection = await client.getOrCreateCollection({
//     name: "my_collection",
//     embeddingFunction,
//   });
//   sampleGet(collection);
//   sampleAdd(collection);
//   sampleUpdate(collection);
//   sampleUpsert(collection);
//   sampleQuery(collection);
//   samplePeek(collection);
//   sampleModify(collection);
//   sampleDelete({ name: collection.name });
// });

// Real world example

const claimData = fs
  .readFileSync("data/scifact/scifact_claims.jsonl")
  .toString()
  .split("\n")
  .map((each) => {
    try {
      return JSON.parse(each);
    } catch (e) {
      // Continue
    }
  });
const corpusData = fs
  .readFileSync("data/scifact/scifact_corpus.jsonl")
  .toString()
  .split("\n")
  .map((each) => {
    try {
      return JSON.parse(each);
    } catch (e) {
      // Continue
    }
  });

const batchSize = 100;

async function processData() {
  for (let i = 0; i < corpusData.length; i += batchSize) {
    const batchData = corpusData.slice(i, i + batchSize);
    for (const row of batchData) {
      (await scifactCorpusCollection).add({
        ids: row["doc_id"].toString(),
        documents: `${row["title"]}. ${row["abstract"].join(" ")}`,
        metadatas: { structured: row["structured"] },
      });
    }
  }
}

processData().then(() => null);

const buildPromptWithContext = (
  claim: any,
  context: any,
): ChatCompletionMessageParam[] => [
  {
    role: "system",
    content:
      "I will ask you to assess whether a particular scientific claim, based on evidence provided. " +
      "Output only the text 'True' if the claim is true, 'False' if the claim is false, or 'NEE' if there's " +
      "not enough evidence.",
  },
  {
    role: "user",
    content: `
The evidence is the following:

${context.join(" ")}

Assess the following claim on the basis of the evidence. Output only the text 'True' if the claim is true,
'False' if the claim is false, or 'NEE' if there's not enough evidence. Do not output any other text.

Claim:
${claim}

Assessment:
`,
  },
];

async function assessClaims(claims: any) {
  const claimQueryResult = await (
    await scifactCorpusCollection
  ).query({
    queryTexts: claims,
    include: [IncludeEnum.Documents, IncludeEnum.Distances],
    nResults: 3,
  });
  const responses = [];

  for (let i = 0; i < claimQueryResult.documents.length; i++) {
    const claim = claims[i];
    const context = claimQueryResult.documents[i];
    if (context.length === 0) {
      responses.push("NEE");
      continue;
    }

    const response = await openai_client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: buildPromptWithContext(claim, context),
      max_tokens: 3,
    });

    const formattedResponse = response.choices[0].message.content?.replace(
      "., ",
      "",
    );
    console.log("Claim: ", claim);
    console.log("Response: ", formattedResponse);
    responses.push(formattedResponse);
  }

  return responses;
}

traceloop.withAssociationProperties({}, async () => {
  const samples = claimData.slice(0, 2); // Get a sample of 2 claims
  assessClaims(samples.map((sample) => sample["claim"]));
});
