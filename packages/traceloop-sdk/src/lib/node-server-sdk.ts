import { initInstrumentations } from "./tracing";

export * from "./errors";
export {
  InitializeOptions,
  TraceloopClientOptions,
  AnnotationCreateOptions,
} from "./interfaces";
export { TraceloopClient } from "./client/traceloop-client";
export { initialize, getClient } from "./configuration";
export { forceFlush } from "./tracing";
export * from "./tracing/decorators";
export * from "./tracing/manual";
export * from "./tracing/association";
export * from "./tracing/custom-metric";
export * from "./tracing/span-processor";
export * from "./prompts";

initInstrumentations();
