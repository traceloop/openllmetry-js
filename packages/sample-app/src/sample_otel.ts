import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const traceProvider = new NodeTracerProvider();

const spanExporter = new OTLPTraceExporter({
  url: "https://otel.baselime.io/v1",
  timeoutMillis: 5000,
  headers: {
    "x-api-key": process.env.BASELIME_API_KEY,
  },
});

const spanProcessor = new SimpleSpanProcessor(spanExporter);

traceProvider.addSpanProcessor(spanProcessor);
traceProvider.register();

registerInstrumentations({
  instrumentations: [new OpenAIInstrumentation()],
});

const tracer = traceProvider.getTracer("opentelemetry-esm-instrumentation");

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function doOpenAI() {
  await tracer.startActiveSpan("doOpenAI", async (span) => {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Hello, how are you?",
        },
      ],
    });

    console.log(response.choices[0].message.content);

    span.end();
  });
}

doOpenAI()
  .catch(console.error)
  .then(() => spanExporter.forceFlush());
