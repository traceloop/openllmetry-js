import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "sample_openai_streaming",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const openai = new OpenAI();

async function create_joke() {
  const responseStream = await traceloop.withTask(
    { name: "joke_creation" },
    () => {
      return openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "user", content: "Tell me a joke about opentelemetry" },
        ],
        stream: true,
      });
    },
  );
  let result = "";
  for await (const chunk of responseStream) {
    result += chunk.choices[0]?.delta?.content || "";
  }
  console.log(result);
  return result;
}

create_joke();
