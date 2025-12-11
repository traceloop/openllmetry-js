import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_nested_agents",
  disableBatch: true,
});

const searchTool = tool({
  description: "Search for information on a topic",
  parameters: z.object({
    query: z.string().describe("Search query"),
  }),
  execute: async ({ query }) => {
    console.log(`    [search_agent] Searching: ${query}`);
    await new Promise((r) => setTimeout(r, 100));
    return {
      results: [
        `Result 1 for "${query}": Found relevant information`,
        `Result 2 for "${query}": Additional context discovered`,
      ],
    };
  },
});

const searchAgentTool = tool({
  description: "Delegate search tasks to the search agent",
  parameters: z.object({
    searchQuery: z.string().describe("What to search for"),
  }),
  execute: async ({ searchQuery }) => {
    console.log(`  [research_agent] Delegating to search_agent: ${searchQuery}`);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Search for: ${searchQuery}. Use the search tool and return results.`,
      tools: { searchTool },
      maxSteps: 3,
      experimental_telemetry: {
        isEnabled: true,
        metadata: { agent: "search_agent" },
      },
    });

    return { searchResults: result.text };
  },
});

const analyzeTool = tool({
  description: "Analyze data and extract insights",
  parameters: z.object({
    data: z.string().describe("Data to analyze"),
  }),
  execute: async ({ data }) => {
    console.log(`    [analysis_agent] Analyzing data...`);
    await new Promise((r) => setTimeout(r, 100));
    return {
      insights: [`Key insight from analysis`, `Pattern detected in data`],
      confidence: 0.85,
    };
  },
});

const analysisAgentTool = tool({
  description: "Delegate analysis tasks to the analysis agent",
  parameters: z.object({
    dataToAnalyze: z.string().describe("Data to analyze"),
  }),
  execute: async ({ dataToAnalyze }) => {
    console.log(
      `  [research_agent] Delegating to analysis_agent: ${dataToAnalyze.substring(0, 50)}...`,
    );

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Analyze this data: ${dataToAnalyze}. Use the analyze tool.`,
      tools: { analyzeTool },
      maxSteps: 3,
      experimental_telemetry: {
        isEnabled: true,
        metadata: { agent: "analysis_agent" },
      },
    });

    return { analysis: result.text };
  },
});

const researchAgentTool = tool({
  description: "Delegate research tasks to the research agent",
  parameters: z.object({
    topic: z.string().describe("Research topic"),
  }),
  execute: async ({ topic }) => {
    console.log(`[orchestrator] Delegating to research_agent: ${topic}`);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Research the topic: "${topic}".
        1. First use the search agent to find information
        2. Then use the analysis agent to analyze findings
        Return a research summary.`,
      tools: { searchAgentTool, analysisAgentTool },
      maxSteps: 5,
      experimental_telemetry: {
        isEnabled: true,
        metadata: { agent: "research_agent" },
      },
    });

    return { research: result.text };
  },
});

const formatTool = tool({
  description: "Format text into a summary",
  parameters: z.object({
    content: z.string().describe("Content to format"),
  }),
  execute: async ({ content }) => {
    console.log(`  [summary_agent] Formatting summary...`);
    await new Promise((r) => setTimeout(r, 100));
    return { formatted: `=== SUMMARY ===\n${content}\n===============` };
  },
});

const summaryAgentTool = tool({
  description: "Delegate summarization to the summary agent",
  parameters: z.object({
    contentToSummarize: z.string().describe("Content to summarize"),
  }),
  execute: async ({ contentToSummarize }) => {
    console.log(`[orchestrator] Delegating to summary_agent`);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Summarize this content concisely: ${contentToSummarize}. Use the format tool.`,
      tools: { formatTool },
      maxSteps: 3,
      experimental_telemetry: {
        isEnabled: true,
        metadata: { agent: "summary_agent" },
      },
    });

    return { summary: result.text };
  },
});

async function runNestedAgents() {
  console.log("\n" + "=".repeat(60));
  console.log("NESTED AGENTS DEMO");
  console.log("=".repeat(60));
  console.log("Agent hierarchy:");
  console.log("  orchestrator_agent");
  console.log("    -> research_agent");
  console.log("         -> search_agent");
  console.log("         -> analysis_agent");
  console.log("    -> summary_agent");
  console.log("=".repeat(60) + "\n");

  const result = await traceloop.withWorkflow(
    { name: "nested_agents_demo" },
    async () => {
      return await generateText({
        model: openai("gpt-4o-mini"),
        prompt: `You are an orchestrator agent. Your task:
          1. Use the research agent to research "AI observability best practices"
          2. Use the summary agent to create a final summary
          Be brief in your responses.`,
        tools: { researchAgentTool, summaryAgentTool },
        maxSteps: 5,
        experimental_telemetry: {
          isEnabled: true,
          metadata: { agent: "orchestrator_agent" },
        },
      });
    },
  );

  console.log("\n" + "=".repeat(60));
  console.log("RESULT");
  console.log("=".repeat(60));
  console.log(result.text);
  console.log("=".repeat(60) + "\n");
}

runNestedAgents().catch(console.error);
