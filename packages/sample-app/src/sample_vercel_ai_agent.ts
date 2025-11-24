import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, CoreMessage } from "ai";
import { z } from "zod";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_vercel_ai_agent",
  disableBatch: true,
});

// Simulated knowledge base
const knowledgeBase = new Map([
  [
    "javascript",
    {
      description: "A high-level programming language",
      popularity: "Very High",
      useCase: "Web development, server-side development, mobile apps",
    },
  ],
  [
    "python",
    {
      description: "An interpreted high-level programming language",
      popularity: "Very High",
      useCase: "Data science, web development, automation, AI/ML",
    },
  ],
  [
    "rust",
    {
      description: "A systems programming language",
      popularity: "Growing",
      useCase: "Systems programming, web assembly, blockchain",
    },
  ],
  [
    "typescript",
    {
      description: "JavaScript with static type definitions",
      popularity: "High",
      useCase: "Large-scale JavaScript applications, enterprise development",
    },
  ],
]);

// Define agent tools
const searchKnowledge = tool({
  description:
    "Search the knowledge base for information about programming languages and technologies",
  parameters: z.object({
    query: z.string().describe("The search term or technology to look up"),
  }),
  execute: async ({ query }) => {
    console.log(`🔍 Searching knowledge base for: ${query}`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const normalizedQuery = query.toLowerCase();
    const result = knowledgeBase.get(normalizedQuery);

    if (result) {
      console.log(`✅ Found information for ${query}:`, result);
      return {
        found: true,
        technology: query,
        ...result,
      };
    } else {
      console.log(`❌ No information found for: ${query}`);
      return {
        found: false,
        technology: query,
        message: "No information available in knowledge base",
      };
    }
  },
});

const analyzeTrends = tool({
  description: "Analyze technology trends and compare popularity",
  parameters: z.object({
    technologies: z
      .array(z.string())
      .describe("Array of technologies to analyze"),
  }),
  execute: async ({ technologies }) => {
    console.log(`📊 Analyzing trends for technologies:`, technologies);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const analysis = technologies.map((tech) => {
      const info = knowledgeBase.get(tech.toLowerCase());
      return {
        technology: tech,
        popularity: info?.popularity || "Unknown",
        trend: Math.random() > 0.5 ? "Growing" : "Stable",
        marketShare: Math.floor(Math.random() * 30) + 5, // 5-35%
      };
    });

    console.log(`📈 Trend analysis complete:`, analysis);
    return {
      analysis,
      summary: `Analyzed ${technologies.length} technologies`,
      recommendation:
        analysis.find((a) => a.popularity === "Very High")?.technology ||
        technologies[0],
    };
  },
});

const generateReport = tool({
  description: "Generate a detailed report based on research data",
  parameters: z.object({
    topic: z.string().describe("The main topic of the report"),
    data: z
      .array(z.string())
      .describe("Key data points to include in the report"),
  }),
  execute: async ({ topic, data }) => {
    console.log(`📝 Generating report on: ${topic}`);
    console.log(`📋 Including data points:`, data);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const report = {
      title: `Research Report: ${topic}`,
      executiveSummary: `This report analyzes ${topic} based on available data and trends.`,
      keyFindings: data,
      methodology: "Knowledge base search and trend analysis",
      generatedAt: new Date().toISOString(),
      confidence: Math.floor(Math.random() * 30) + 70, // 70-100%
    };

    console.log(`📊 Report generated successfully`);
    return report;
  },
});

const saveToMemory = tool({
  description:
    "Save important information to agent memory for future reference",
  parameters: z.object({
    key: z.string().describe("Memory key identifier"),
    value: z.string().describe("Information to store"),
  }),
  execute: async ({ key, value }) => {
    console.log(`💾 Saving to memory - ${key}: ${value}`);

    // In a real implementation, this would persist to a database
    // For demo purposes, we'll just log it
    agentMemory.set(key, {
      value,
      timestamp: new Date().toISOString(),
      accessCount: 0,
    });

    console.log(`✅ Saved to memory successfully`);
    return {
      saved: true,
      key,
      value,
      totalMemoryItems: agentMemory.size,
    };
  },
});

const recallFromMemory = tool({
  description: "Recall previously saved information from agent memory",
  parameters: z.object({
    key: z.string().describe("Memory key to recall"),
  }),
  execute: async ({ key }) => {
    console.log(`🧠 Recalling from memory: ${key}`);

    const memory = agentMemory.get(key);
    if (memory) {
      memory.accessCount++;
      console.log(`✅ Memory recalled:`, memory);
      return {
        found: true,
        key,
        value: memory.value,
        timestamp: memory.timestamp,
        accessCount: memory.accessCount,
      };
    } else {
      console.log(`❌ No memory found for key: ${key}`);
      return {
        found: false,
        key,
        message: "No memory found for this key",
      };
    }
  },
});

// Simple in-memory storage for agent memory
const agentMemory = new Map<
  string,
  {
    value: string;
    timestamp: string;
    accessCount: number;
  }
>();

class ResearchAgent {
  private conversationHistory: CoreMessage[] = [];
  private sessionId: string;
  private userId?: string;

  constructor(userId?: string) {
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
    this.userId = userId;
    console.log(`🆔 Initialized agent with session: ${this.sessionId}`);
  }

  async processRequest(userInput: string): Promise<string> {
    return await traceloop.withWorkflow(
      { name: "research_agent_request" },
      async () => {
        console.log(`\n🤖 Research Agent processing: "${userInput}"`);
        console.log(
          `📋 Session: ${this.sessionId} | User: ${this.userId || "anonymous"} | Turn: ${this.conversationHistory.length / 2 + 1}\n`,
        );

        // Add user message to conversation history
        this.conversationHistory.push({
          role: "user",
          content: userInput,
        });

        const result = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "system",
              content: `You are a helpful research assistant agent. You have access to several tools:
- searchKnowledge: Search for information about programming languages and technologies
- analyzeTrends: Analyze and compare technology trends
- generateReport: Create detailed reports from research data
- saveToMemory: Save important information for future reference
- recallFromMemory: Retrieve previously saved information

Your goal is to help users research technologies, analyze trends, and provide comprehensive information.
You can maintain context across multiple interactions and remember important details.

Be proactive in using your tools to provide thorough and accurate responses. If you need to save important
findings for future use, use saveToMemory. If the user refers to previous conversations, try recallFromMemory.

Agent Session: ${this.sessionId}
User ID: ${this.userId || "anonymous"}
Conversation Turn: ${this.conversationHistory.length / 2 + 1}`,
            },
            ...this.conversationHistory,
          ],
          tools: {
            searchKnowledge,
            analyzeTrends,
            generateReport,
            saveToMemory,
            recallFromMemory,
          },
          maxSteps: 10, // Allow multiple tool interactions
          experimental_telemetry: {
            isEnabled: true,
            // Metadata can be included in telemetry data
            functionId: `research_agent_${this.sessionId}`,
            metadata: {
              agent: "research_assistant",
              sessionId: this.sessionId,
              userId: this.userId || "anonymous",
              conversationTurn: this.conversationHistory.length / 2 + 1,
              timestamp: new Date().toISOString(),
            },
          },
        });

        // Add assistant response to conversation history
        this.conversationHistory.push({
          role: "assistant",
          content: result.text,
        });

        return result.text;
      },
      { userInput },
    );
  }

  getConversationHistory(): CoreMessage[] {
    return [...this.conversationHistory];
  }

  clearMemory(): void {
    this.conversationHistory = [];
    agentMemory.clear();
    console.log("🧹 Agent memory cleared");
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }
}

async function demonstrateAgent() {
  // Initialize agent with user ID for metadata tracking
  const agent = new ResearchAgent("demo_user_123");

  const queries = [
    "I'm starting a new project and need to choose between JavaScript and TypeScript. Can you help me research both?",
    "Based on your previous research, can you analyze the trends for JavaScript, TypeScript, Python, and Rust?",
    "Please generate a comprehensive report on the best language for web development based on our research",
    "Save the key finding from our research session for future reference",
    "What did we conclude about web development languages?",
  ];

  console.log(`🏷️  Agent Metadata:`);
  console.log(`   Session ID: ${agent.getSessionId()}`);
  console.log(`   User ID: ${agent.getUserId()}`);
  console.log(`   Queries to process: ${queries.length}`);

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🎯 QUERY ${i + 1}: ${queries[i]}`);
    console.log("=".repeat(80));

    const response = await agent.processRequest(queries[i]);

    console.log("\n🤖 AGENT RESPONSE:");
    console.log("-".repeat(40));
    console.log(response);

    // Add delay between queries to simulate real conversation
    if (i < queries.length - 1) {
      console.log("\n⏳ Processing next query in 2 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("📊 CONVERSATION SUMMARY");
  console.log("=".repeat(80));
  console.log(
    `Total messages in conversation: ${agent.getConversationHistory().length}`,
  );
  console.log(`Items saved in memory: ${agentMemory.size}`);
  console.log("=".repeat(80));
}

async function main() {
  try {
    await demonstrateAgent();
  } catch (error) {
    console.error("❌ Error running agent demo:", error);
  }
}

main().catch(console.error);
