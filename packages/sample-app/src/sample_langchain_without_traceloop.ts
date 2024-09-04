import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain';
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai';
import { OpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { LLMChain } from 'langchain/chains';

import * as ChainsModule from "langchain/chains";
import * as AgentsModule from "langchain/agents";
import * as ToolsModule from "langchain/tools";


const traceExporter = new OTLPTraceExporter({
  url: 'https://api.traceloop.com/v1/traces',
  headers: {
    'Authorization': `Bearer ${process.env.TRACELOOP_API_KEY}`,
    'X-Traceloop-SDK-Version': '0.0.1',
  },
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'langchain-sample-app',
  }),
  spanProcessor: new SimpleSpanProcessor(traceExporter),
  instrumentations: [new OpenAIInstrumentation()],
});

new LangChainInstrumentation().manuallyInstrument({
  chainsModule: ChainsModule,
  agentsModule: AgentsModule,
  toolsModule: ToolsModule,
});

sdk.start();

async function main() {
  const model = new OpenAI({ temperature: 0.9 });
  const template = 'What is a good name for a company that makes {product}?';
  const prompt = new PromptTemplate({
    template: template,
    inputVariables: ['product'],
  });
  const chain = new LLMChain({ llm: model, prompt: prompt });
  const result = await chain.call({ product: 'eco-friendly water bottles' });
  
  console.log(result);
}

main().then(() => {
  sdk.shutdown()
    .then()
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});