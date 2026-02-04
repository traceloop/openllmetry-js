import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { streamText, CoreMessage, tool, stepCountIs } from "ai";
import * as readline from "readline";
import { z } from "zod";

import "dotenv/config";

// Example of using withConversation to set the conversation ID for a workflow


traceloop.initialize({
  appName: "sample_chatbot_interactive",
  disableBatch: true,
});

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
  private conversationId: string;
  private userId: string;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colors.cyan}${colors.bright}You: ${colors.reset}`,
    });
    this.conversationId = `conversation-${Date.now()}`;
    this.userId = `user-${Math.random().toString(36).substring(7)}`;
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

  async processMessage(userMessage: string): Promise<string> {
    return traceloop.withConversation(this.conversationId, async () => {
      // Add user message to history
      this.conversationHistory.push({
        role: "user",
        content: userMessage,
      });

      console.log(
        `\n${colors.green}${colors.bright}Assistant: ${colors.reset}`,
      );

      // Stream the response
      const result = await streamText({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "system",
            content:
              "You are a helpful AI assistant with access to tools. Use the available tools when appropriate to provide accurate information. Provide clear, concise, and friendly responses.",
          },
          ...this.conversationHistory,
        ],
        tools: {
          calculator: tool({
            description:
              "Perform mathematical calculations. Supports basic arithmetic operations.",
            inputSchema: z.object({
              expression: z
                .string()
                .describe(
                  "The mathematical expression to evaluate (e.g., '2 + 2' or '10 * 5')",
                ),
            }),
            execute: async ({ expression }: { expression: string }) => {
              try {
                const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
                const result = eval(sanitized);
                console.log(
                  `\n${colors.yellow}🔧 Calculator: ${expression} = ${result}${colors.reset}`,
                );
                return { result, expression };
              } catch (error) {
                return { error: "Invalid mathematical expression" };
              }
            },
          }),
          getCurrentWeather: tool({
            description:
              "Get the current weather for a location. Use this when users ask about weather conditions.",
            inputSchema: z.object({
              location: z
                .string()
                .describe("The city and country, e.g., 'London, UK'"),
            }),
            execute: async ({ location }: { location: string }) => {
              console.log(
                `\n${colors.yellow}🔧 Weather: Checking weather for ${location}${colors.reset}`,
              );
              // Simulated weather data
              const weatherConditions = [
                "sunny",
                "cloudy",
                "rainy",
                "partly cloudy",
              ];
              const condition =
                weatherConditions[
                  Math.floor(Math.random() * weatherConditions.length)
                ];
              const temperature = Math.floor(Math.random() * 30) + 10; // 10-40°C
              return {
                location,
                temperature: `${temperature}°C`,
                condition,
                humidity: `${Math.floor(Math.random() * 40) + 40}%`,
              };
            },
          }),
          getTime: tool({
            description:
              "Get the current date and time. Use this when users ask about the current time or date.",
            inputSchema: z.object({
              timezone: z
                .string()
                .optional()
                .describe("Optional timezone (e.g., 'America/New_York')"),
            }),
            execute: async ({ timezone }: { timezone?: string }) => {
              const now = new Date();
              const options: Intl.DateTimeFormatOptions = {
                timeZone: timezone,
                dateStyle: "full",
                timeStyle: "long",
              };
              const formatted = now.toLocaleString("en-US", options);
              console.log(
                `\n${colors.yellow}🔧 Time: ${formatted}${colors.reset}`,
              );
              return {
                datetime: formatted,
                timestamp: now.toISOString(),
                timezone: timezone || "local",
              };
            },
          }),
        },
        stopWhen: stepCountIs(5),
        experimental_telemetry: { isEnabled: true },
      });

      let fullResponse = "";
      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }

      console.log("\n");

      const finalResult = await result.response;

      for (const message of finalResult.messages) {
        this.conversationHistory.push(message);
      }

      await this.generateSummary(userMessage, fullResponse);

      return fullResponse;
    });
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
    console.log(
      `${colors.dim}Conversation ID: ${this.conversationId}${colors.reset}`,
    );
    console.log(`${colors.dim}User ID: ${this.userId}${colors.reset}\n`);

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
