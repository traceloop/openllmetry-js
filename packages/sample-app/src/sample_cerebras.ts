import * as traceloop from "@traceloop/node-server-sdk";
import { Cerebras } from "@cerebras/cerebras_cloud_sdk";

traceloop.initialize({
  appName: "sample_cerebras",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const cerebras = new Cerebras({});

async function main() {
  const completion = await cerebras.chat.completions.create({
    max_tokens: 1024,
    model: "llama-3.1-8b",
    messages: [
      {
        role: "user",
        content: "How does a court case get to the Supreme Court?",
      },
    ],
  });

  console.log((completion.choices as any)[0].message.content);
}

main();
