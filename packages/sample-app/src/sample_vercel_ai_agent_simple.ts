import * as traceloop from "@traceloop/node-server-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";

import "dotenv/config";

traceloop.initialize({
  appName: "sample_vercel_ai_agent_simple",
  disableBatch: true,
});

// Simple calculator tool for the agent
const calculate = tool({
  description: "Perform basic mathematical calculations",
  parameters: z.object({
    operation: z
      .enum(["add", "subtract", "multiply", "divide"])
      .describe("The mathematical operation to perform"),
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  execute: async ({ operation, a, b }: { operation: "add" | "subtract" | "multiply" | "divide"; a: number; b: number }) => {
    console.log(`🔧 Calculating: ${a} ${operation} ${b}`);

    let result: number;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    console.log(`✅ Result: ${result}`);
    return { operation, a, b, result };
  },
});

// Task management tool
const createTask = tool({
  description: "Create and manage tasks in a simple task list",
  parameters: z.object({
    action: z
      .enum(["create", "complete", "list"])
      .describe("Action to perform on tasks"),
    taskName: z
      .string()
      .optional()
      .describe("Name of the task (required for create and complete)"),
  }),
  execute: async ({ action, taskName }) => {
    console.log(`📝 Task ${action}:${taskName ? ` ${taskName}` : ""}`);

    switch (action) {
      case "create":
        if (!taskName) throw new Error("Task name required for create action");
        tasks.push({ name: taskName, completed: false, id: tasks.length + 1 });
        console.log(`✅ Created task: ${taskName}`);
        return { action: "created", task: taskName, totalTasks: tasks.length };

      case "complete": {
        if (!taskName)
          throw new Error("Task name required for complete action");
        const task = tasks.find((t) => t.name === taskName && !t.completed);
        if (task) {
          task.completed = true;
          console.log(`✅ Completed task: ${taskName}`);
          return { action: "completed", task: taskName };
        } else {
          console.log(`❌ Task not found: ${taskName}`);
          return {
            action: "error",
            message: "Task not found or already completed",
          };
        }
      }

      case "list":
        console.log(`📋 Listing ${tasks.length} tasks`);
        return {
          action: "listed",
          tasks: tasks.map((t) => ({ name: t.name, completed: t.completed })),
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t) => t.completed).length,
        };
    }
  },
});

// Simple in-memory task storage
const tasks: Array<{ name: string; completed: boolean; id: number }> = [];

async function runSimpleAgent() {
  // Generate session metadata for tracking
  const sessionId = `simple_session_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  const userId = "demo_user_simple";

  console.log(`🆔 Starting simple agent session: ${sessionId}`);
  console.log(`👤 User: ${userId}`);

  return await traceloop.withWorkflow(
    { name: "simple_agent_demo" },
    async () => {
      console.log("\n🤖 Simple AI Agent Demo\n");

      const result = await generateText({
        model: openai("gpt-4o"),
        prompt: `You are a helpful AI assistant with access to calculator and task management tools.

Please demonstrate your capabilities by:
1. Calculating 25 * 4 + 10
2. Creating a task called "Review agent demo"
3. Creating another task called "Test calculator"
4. Completing the "Test calculator" task
5. Listing all tasks to show the current status

Be conversational and explain what you're doing at each step.

Session: ${sessionId}
User: ${userId}`,
        tools: {
          calculate,
          createTask,
        },
        maxSteps: 8,
        experimental_telemetry: {
          isEnabled: true,
          functionId: `simple_agent_${sessionId}`,
          metadata: {
            agent: "simple_demo_agent",
            sessionId: sessionId,
            userId: userId,
            demoVersion: "1.0",
            timestamp: new Date().toISOString(),
          },
        },
      });

      return result.text;
    },
    { sessionId, userId, agentType: "simple_demo" },
  );
}

async function main() {
  try {
    console.log("🏷️  Simple Agent Demo with Metadata Tracking");
    console.log("   - Session ID: Auto-generated per run");
    console.log("   - User ID: demo_user_simple");
    console.log("   - Agent Type: simple_demo");
    console.log("   - Telemetry: Enabled with metadata");

    const response = await runSimpleAgent();

    console.log("\n" + "=".repeat(80));
    console.log("🤖 AGENT RESPONSE");
    console.log("=".repeat(80));
    console.log(response);
    console.log("=".repeat(80));
    console.log(`📊 Final task count: ${tasks.length}`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ Error running simple agent:", error);
  }
}

main().catch(console.error);
