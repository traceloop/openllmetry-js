import * as llamaindex from "llamaindex";
import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";
import { OpenAIAgent, OpenAI as LLamaOpenAI } from "@llamaindex/openai";

traceloop.initialize({
  appName: "sample_llamaindex_openai_agent",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  instrumentModules: {
    llamaIndex: llamaindex,
    openAI: OpenAI,
  },
});

const sumNumbers = llamaindex.FunctionTool.from(
  ({ a, b }: { a: number; b: number }) => `${a + b}`,
  {
    name: "sumNumbers",
    description: "Use this function to sum two numbers",
    parameters: {
      type: "object",
      properties: {
        a: {
          type: "number",
          description: "The first number",
        },
        b: {
          type: "number",
          description: "The second number",
        },
      },
      required: ["a", "b"],
    },
  },
);

const divideNumbers = llamaindex.FunctionTool.from(
  ({ a, b }: { a: number; b: number }) => `${a / b}`,
  {
    name: "divideNumbers",
    description: "Use this function to divide two numbers",
    parameters: {
      type: "object",
      properties: {
        a: {
          type: "number",
          description: "The dividend a to divide",
        },
        b: {
          type: "number",
          description: "The divisor b to divide by",
        },
      },
      required: ["a", "b"],
    },
  },
);

async function main() {
  const agent = new OpenAIAgent({
    llm: new LLamaOpenAI({
      session: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      }),
    }),
    tools: [sumNumbers, divideNumbers],
  });

  const response = await agent.chat({
    message: "How much is 5 + 5? then divide by 2",
  });

  console.log(response.message);
}

void main().then(() => {
  console.log("Done");
});
