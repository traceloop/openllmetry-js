import * as traceloop from "@traceloop/node-server-sdk";
import { OpenAI } from "llamaindex";
// import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  //  exporter: new ConsoleSpanExporter(),
});

const openaiLLM = new OpenAI({ model: "gpt-3.5-turbo", temperature: 0 });

class SampleLlamaIndex {
  @traceloop.workflow("sample_completion")
  async completion() {
    const resp = await openaiLLM.complete("What's you name?");
    return resp;
  }

}

traceloop.withAssociationProperties(
  { user_id: "12345", chat_id: "789" },
  async () => {
    const sampleLlamaIndex = new SampleLlamaIndex();

    const completion = await sampleLlamaIndex.completion();

    console.log('completion', completion);
  },
);

