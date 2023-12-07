import * as traceloop from "@traceloop/node-server-sdk";
import { trace, Span, context } from "@opentelemetry/api";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";

trace.getTracer("traceloop.tracer");

// No spans should be printed to the console when this file runs (it should be filtered out by the sampler)

const main = async () => {
  traceloop.initialize({
    appName: "sample_sampler",
    apiKey: process.env.TRACELOOP_API_KEY,
    disableBatch: true,
    traceloopSyncEnabled: false,
    exporter: new ConsoleSpanExporter(),
  });

  trace
    .getTracer("traceloop.tracer")
    .startActiveSpan(
      "test-span",
      { attributes: { "next.span_name": "anything" } },
      context.active(),
      async (span: Span) => {
        span.end();
      },
    );
};

main();
