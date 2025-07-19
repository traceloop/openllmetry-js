import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

const main = async () => {
  traceloop.initialize({
    appName: "sample_prompt_mgmt",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true,
    traceloopSyncEnabled: true,
  });

  await traceloop.waitForInitialization();

  const openai = new OpenAI();
  const prompt = traceloop.getPrompt("vadyms_prompt", { person: "Vadym", var1: "example", var2: "example2" }); // NOTE: ensure prompt exists
  console.log("Fetched prompt: ", prompt);

  const chatCompletion = await openai.chat.completions.create(prompt);
  console.log(chatCompletion.choices[0].message.content);
};

main();
