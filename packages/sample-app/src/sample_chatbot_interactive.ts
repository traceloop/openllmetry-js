import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage } from "ai";
import * as readline from "readline";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_chatbot_interactive",
  disableBatch: true,
});

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

class InteractiveChatbot {
  private conversationHistory: CoreMessage[] = [];
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}${colors.bright}You: ${colors.reset}`,
    });
  }

  @traceloop.task({ name: "summarize_interaction" })
  async generateSummary(
    userMessage: string,
    assistantResponse: string,
  ): Promise<string> {
    console.log(
      `\n${colors.yellow}▼ SUMMARY${colors.reset} ${colors.dim}TASK${colors.reset}`,
    );

    const summaryResult = await streamText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content:
            "Create a very brief title (3-6 words) that summarizes this conversation exchange. Only return the title, nothing else.",
        },
        {
          role: "user",
          content: `User: ${userMessage}\n\nAssistant: ${assistantResponse}`,
        },
      ],
      experimental_telemetry: { isEnabled: true },
    });

    let summary = "";
    for await (const chunk of summaryResult.textStream) {
      summary += chunk;
    }

    const cleanSummary = summary.trim().replace(/^["']|["']$/g, "");
    console.log(`${colors.dim}${cleanSummary}${colors.reset}`);

    return cleanSummary;
  }

  @traceloop.workflow({ name: "chat_interaction" })
  async processMessage(userMessage: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    console.log(`\n${colors.green}${colors.bright}Assistant: ${colors.reset}`);

    // Stream the response
    const result = await streamText({
      model: openai("gpt-4o"),
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. Provide clear, concise, and friendly responses.",
        },
        ...this.conversationHistory,
      ],
      experimental_telemetry: { isEnabled: true },
    });

    let fullResponse = "";
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }

    console.log("\n");

    // Add assistant response to history
    this.conversationHistory.push({
      role: "assistant",
      content: fullResponse,
    });

    // Generate summary for this interaction
    await this.generateSummary(userMessage, fullResponse);

    return fullResponse;
  }

  clearHistory(): void {
    this.conversationHistory = [];
    console.log(
      `\n${colors.magenta}✓ Conversation history cleared${colors.reset}\n`,
    );
  }

  async start(): Promise<void> {
    console.log(
      `${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════╗`,
    );
    console.log(
      `║          Interactive AI Chatbot with Traceloop            ║`,
    );
    console.log(
      `╚════════════════════════════════════════════════════════════╝${colors.reset}\n`,
    );
    console.log(
      `${colors.dim}Commands: /exit (quit) | /clear (clear history)${colors.reset}\n`,
    );

    this.rl.prompt();

    this.rl.on("line", async (input: string) => {
      const trimmedInput = input.trim();

      if (!trimmedInput) {
        this.rl.prompt();
        return;
      }

      if (trimmedInput === "/exit") {
        console.log(`\n${colors.magenta}Goodbye! 👋${colors.reset}\n`);
        this.rl.close();
        process.exit(0);
      }

      if (trimmedInput === "/clear") {
        this.clearHistory();
        this.rl.prompt();
        return;
      }

      try {
        await this.processMessage(trimmedInput);
      } catch (error) {
        console.error(
          `\n${colors.bright}Error:${colors.reset} ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }

      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log(`\n${colors.magenta}Goodbye! 👋${colors.reset}\n`);
      process.exit(0);
    });
  }
}

async function main() {
  const chatbot = new InteractiveChatbot();
  await chatbot.start();
}

main().catch(console.error);
