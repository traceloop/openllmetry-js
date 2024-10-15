import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";

traceloop.initialize({
  appName: "sample_openai",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const openai = new OpenAI();

class SampleOpenAI {
  constructor(private model = "gpt-3.5-turbo") {}

  @traceloop.workflow({ name: "sample_chat" })
  async chat() {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: "user", content: "Tell me a joke about OpenTelemetry" },
      ],
      model: this.model,
    });

    return chatCompletion.choices[0].message.content;
  }

  @traceloop.workflow((thisArg) => ({
    name: `sample_${(thisArg as SampleOpenAI).model}`,
  }))
  async completion(jokeSubject: string) {
    const completion = await openai.completions.create({
      prompt: `Tell me a joke about ${jokeSubject}`,
      model: "gpt-3.5-turbo-instruct",
    });
    traceloop.reportCustomMetric("test_metric", 50.2);

    return completion.choices[0].text;
  }
}

traceloop.withAssociationProperties(
  { user_id: "12345", chat_id: "789" },
  async () => {
    const sampleOpenAI = new SampleOpenAI();
    const chat = await sampleOpenAI.chat();
    console.log(chat);

    const completion = await sampleOpenAI.completion("TypeScript");
    console.log(completion);

    await traceloop.reportScore({ chat_id: "789" }, 1);
  },
);
