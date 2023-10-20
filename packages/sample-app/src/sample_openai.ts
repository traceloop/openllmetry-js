import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "sample_openai",
  baseUrl: process.env.TRACELOOP_BASE_URL,
  apiKey: process.env.TRACELOOP_API_KEY!,
  disableBatch: true,
});
const openai = new OpenAI();

async function chat() {
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "Tell me a joke about OpenTelemetry" }],
    model: "gpt-3.5-turbo",
  });

  console.log(chatCompletion.choices[0].message.content);
}

async function completion() {
  const completion = await openai.completions.create({
    prompt: "Tell me a joke about TypeScript",
    model: "gpt-3.5-turbo-instruct",
  });

  console.log(completion.choices[0].text);
}

chat();
completion();
