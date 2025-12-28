export * from "./errors";
export {
  InitializeOptions,
  TraceloopClientOptions,
  AnnotationCreateOptions,
  DatasetCreateOptions,
  DatasetUpdateOptions,
  DatasetResponse,
  ColumnDefinition,
  ColumnResponse,
  ColumnUpdateOptions,
  RowData,
  RowResponse,
  RowUpdateOptions,
  DatasetListResponse,
  DatasetPublishOptions,
  CSVImportOptions,
  DatasetVersion,
  DatasetVersionsResponse,
  ExperimentTaskFunction,
  ExperimentRunOptions,
  ExperimentRunResult,
  TaskInput,
  TaskOutput,
  TaskResponse,
  ExecutionResponse,
  EvaluatorDetails,
  GithubContext,
  TaskResult,
  RunInGithubOptions,
  RunInGithubResponse,
  StreamEvent,
  SSEStreamEvent,
} from "./interfaces";
export { TraceloopClient } from "./client/traceloop-client";
export {
  Dataset,
  Datasets,
  Column,
  Row,
  Attachment,
  ExternalAttachment,
  AttachmentReference,
  attachment,
  isAttachment,
  isExternalAttachment,
  isAttachmentReference,
  isAnyAttachment,
  AttachmentUploader,
} from "./client/dataset";
export type {
  FileCellType,
  FileStorageType,
  AttachmentMetadata,
  AttachmentOptions,
  ExternalAttachmentOptions,
  UploadUrlResponse,
} from "./client/dataset";
export { Experiment } from "./client/experiment";
export { Evaluator } from "./client/evaluator";
export { initialize, getClient } from "./configuration";
export { forceFlush } from "./tracing";
export { getTraceloopTracer } from "./tracing/tracing";
export * from "./tracing/decorators";
export * from "./tracing/manual";
export * from "./tracing/association";
export * from "./tracing/custom-metric";
export * from "./tracing/span-processor";
export * from "./prompts";
export { Associations, AssociationProperty } from "./associations/associations";
export type { Association } from "./associations/associations";

// Instrumentations are now initialized only when initialize() is called
