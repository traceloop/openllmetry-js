import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";
import * as readline from "readline";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_conversation_simple",
  disableBatch: true,
});

const openai = new OpenAI();

async function chat(messages: OpenAI.ChatCompletionMessageParam[]) {
  const chatCompletion = await openai.chat.completions.create({
    messages,
    model: "gpt-4o-mini",
  });

  return chatCompletion.choices[0].message.content;
}

async function main() {
  const conversationId = `${crypto.randomUUID().substring(0, 8)}`;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant." },
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\nConversation ID: ${conversationId}`);
  console.log('Type "exit" to quit.\n');

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const userMessage = input.trim();

      if (!userMessage) {
        askQuestion();
        return;
      }

      if (userMessage.toLowerCase() === "exit") {
        console.log("\nGoodbye!");
        rl.close();
        process.exit(0);
      }

      const response = await traceloop.withConversation(
        conversationId,
        async () => {
          return await traceloop.withWorkflow(
            { name: "chat_turn" },
            async () => {
              messages.push({ role: "user", content: userMessage });
              const reply = await chat(messages);
              messages.push({ role: "assistant", content: reply ?? "" });
              return reply;
            },
          );
        },
      );

      console.log(`Assistant: ${response}\n`);
      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);
