import * as traceloop from "@traceloop/node-server-sdk";
traceloop.initialize({
  appName: "sample_openai",
  baseUrl: process.env.TRACELOOP_BASE_URL!,
  apiKey: process.env.TRACELOOP_API_KEY!,
  disableBatch: true,
});

import OpenAI from "openai";

const openai = new OpenAI();

async function main() {
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "Tell me a joke about OpenTelemetry" }],
    model: "gpt-3.5-turbo",
  });

  console.log(chatCompletion.choices[0].message.content);
}

main();
