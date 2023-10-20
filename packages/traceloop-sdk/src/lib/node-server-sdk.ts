import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";

export * from "./errors";
export { InitializeOptions } from "./interfaces";
export { initialize } from "./configuration";

export const INSTRUMENTATIONS = [new OpenAIInstrumentation()];
