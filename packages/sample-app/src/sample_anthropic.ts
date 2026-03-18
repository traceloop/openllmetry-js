import * as traceloop from "@traceloop/node-server-sdk";

import Anthropic, * as anthropicModule from "@anthropic-ai/sdk";

traceloop.initialize({
  appName: "sample_anthropic",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  instrumentModules: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anthropic: anthropicModule as any,
  },
});

const anthropic = new Anthropic({});

async function main() {
  const completion = await anthropic.messages.create({
    max_tokens: 1024,
    model: "claude-sonnet-4-6",
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
