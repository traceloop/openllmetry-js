import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "sample_openai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const openai = new OpenAI();

async function chat() {
  return await traceloop.withWorkflow({ name: "sample_chat" }, async () => {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: "gpt-3.5-turbo",
      logprobs: true,
    });

    return chatCompletion.choices[0].message.content;
  });
}

async function completion(jokeSubject: string) {
  return await traceloop.withWorkflow(
    { name: "sample_completion" },
    async () => {
      const completion = await openai.completions.create({
        prompt: [`Tell me a joke about ${jokeSubject}`],
        model: "gpt-3.5-turbo-instruct",
      });

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
