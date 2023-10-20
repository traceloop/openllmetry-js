import { initInstrumentations } from "./tracing";

export * from "./errors";
export { InitializeOptions } from "./interfaces";
export { initialize } from "./configuration";
export * from "./tracing/decorators";

initInstrumentations();
