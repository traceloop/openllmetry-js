export * from "./initialize-options.interface";
export * from "./prompts.interface";
export * from "./annotations.interface";
export * from "./traceloop-client.interface";
export * from "./dataset.interface";
export interface TraceloopClientOptions {
  apiKey: string;
  appName: string;
  baseUrl?: string;
}
