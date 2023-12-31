import * as traceloop from "@traceloop/node-server-sdk";
import {
  OpenAIEmbedding,
  SimpleDirectoryReader,
  PGVectorStore,
  VectorStoreIndex,
  serviceContextFromDefaults,
  storageContextFromDefaults,
} from "llamaindex";
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

traceloop.initialize({
  appName: "sample_llamaindex",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
  exporter: new ConsoleSpanExporter(),
});

const embedModel = new OpenAIEmbedding();

const vectorStore = new PGVectorStore();

vectorStore.setCollection('quickstart');

(async () => {
  const documents = await (new SimpleDirectoryReader()).loadData({ directoryPath: '/Users/k/personal/openllmetry-js/packages/sample-app/src/data/' });

  const serviceContext = serviceContextFromDefaults({ embedModel });
  const storageContext = await storageContextFromDefaults({ vectorStore });

  const index = await VectorStoreIndex.fromDocuments(documents, { storageContext, serviceContext });

  const queryEngine = index.asQueryEngine();

  const res = await queryEngine.query('What did the author do growing up?');

  console.log(res);
})()
  .then(() => process.exit(0))
  .catch((e) => {console.log(e); process.exit(1);});

// const openaiLLM = new OpenAI({ model: "gpt-3.5-turbo", temperature: 0 });
//class SampleLlamaIndex {
//  @traceloop.workflow("sample_completion")
//  async completion() {
//    const resp = await openaiLLM.complete("What's you name?");
//    return resp;
//  }
//
//}
//
//traceloop.withAssociationProperties(
//  { user_id: "12345", chat_id: "789" },
//  async () => {
//    const sampleLlamaIndex = new SampleLlamaIndex();
//
//    const completion = await sampleLlamaIndex.completion();
//
//    console.log('completion', completion);
//  },
//);
//
