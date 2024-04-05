import * as traceloop from "@traceloop/node-server-sdk";
import Anthropic from "@anthropic-ai/sdk";

traceloop.initialize({
  appName: "sample_anthropic",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const anthropic = new Anthropic({});

async function main() {
  const completion = await anthropic.messages.create({
    max_tokens: 1024,
    model: "claude-3-opus-20240229",
    messages: [
      {
        role: "user",
        content: "How does a court case get to the Supreme Court?",
      },
    ],
  });
  console.log(completion.content);
}

main();
