import * as traceloop from "@traceloop/node-server-sdk";
import { CohereClient } from "cohere-ai";

traceloop.initialize({
  appName: "sample_cohere",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY ?? "",
});

const sampleGenerate = async () => {
  return await traceloop.withWorkflow("sample_generate", {}, async () => {
    const response = await cohere.generate({
      model: "command-light",
      prompt: "What happened to Pluto?",
      k: 1,
      temperature: 2,
    });

    console.log(response);
  });
};

const sampleGenerateStream = async () => {
  const streamedResponse = await cohere.generateStream({
    prompt: "What happened to Pluto?",
    k: 1,
    temperature: 2,
  });

  for await (const message of streamedResponse) {
    if (message.eventType === "text-generation") {
      // { eventType: 'text-generation', text: ' Pluto', isFinished: false }
      console.log(message.text);
    }
  }
};

const sampleChat = async () => {
  const chatResponse = await cohere.chat({
    chatHistory: [
      { role: "USER", message: "Who discovered gravity?" },
      {
        role: "CHATBOT",
        message:
          "The man who is widely credited with discovering gravity is Sir Isaac Newton",
      },
    ],
    message: "What year was he born?",
    // perform web search before answering the question. You can also use your own custom connector.
    connectors: [{ id: "web-search" }],
  });

  console.log(chatResponse);
};

const sampleChatStream = async () => {
  return await traceloop.withWorkflow("sample_chat_stream", {}, async () => {
    const chatStream = await cohere.chatStream({
      chatHistory: [
        { role: "USER", message: "Who discovered gravity?" },
        {
          role: "CHATBOT",
          message:
            "The man who is widely credited with discovering gravity is Sir Isaac Newton",
        },
      ],
      message: "What year was he born?",
      // perform web search before answering the question. You can also use your own custom connector.
      connectors: [{ id: "web-search" }],
    });

    for await (const message of chatStream) {
      if (message.eventType === "stream-end") {
        console.log(message);
      }
    }
  });
};

const sampleRerank = async () => {
  return await traceloop.withWorkflow("sample_rerank", {}, async () => {
    const rerank = await cohere.rerank({
      documents: [
        {
          text: "Carson City is the capital city of the American state of Nevada.",
        },
        {
          text: "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
        },
        {
          text: "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
        },
        {
          text: "Capital punishment (the death penalty) has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states.",
        },
      ],
      query: "What is the capital of the United States?",
      topN: 3,
      returnDocuments: true,
    });

    console.log(rerank);
  });
};

traceloop.withAssociationProperties({}, async () => {
  await sampleGenerate();
  await sampleGenerateStream();
  await sampleChat();
  await sampleChatStream();
  await sampleRerank();
});
