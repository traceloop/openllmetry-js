export interface ExperimentTaskFunction<TInput = Record<string, any>, TOutput = Record<string, any>> {
  (input: TInput): Promise<TOutput> | TOutput;
}

export interface EvaluatorDetails {
  name: string;
  version?: string;
}

export interface ExperimentRunOptions {
  datasetSlug?: string;
  datasetVersion?: string;
  evaluators?: EvaluatorDetails[];
  experimentSlug?: string;
  relatedRef?: Record<string, string>;
  aux?: Record<string, string>;
  stopOnError?: boolean;
  waitForResults?: boolean;
  concurrency?: number;
}

import type { InputSchemaMapping } from './evaluator.interface';

export interface TaskResponse {
  input: Record<string, any>;
  output: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp?: number;
  error?: string;
  input_schema_mapping?: InputSchemaMapping;
}

export interface ExperimentRunResult {
  results: TaskResponse[];
  errors: string[];
  experimentId?: string;
  runId?: string;
  evaluations?: ExecutionResponse[];
}

export interface InitExperimentRequest {
  slug: string;
  datasetSlug?: string;
  datasetVersion?: string;
  evaluatorSlugs?: string[];
  experimentMetadata?: Record<string, any>;
  experimentRunMetadata?: Record<string, any>;
  relatedRef?: Record<string, string>;
  aux?: Record<string, string>;
}

export interface ExperimentResponse {
  id: string;
  slug: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ExperimentRunResponse {
  id: string;
  metadata?: Record<string, any>;
  dataset_id?: string;
  dataset_version?: string;
  evaluator_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface ExperimentInitResponse {
  experiment: ExperimentResponse;
  run: ExperimentRunResponse;
}

export interface ExecutionResponse {
  executionId: string;
  result: Record<string, any>;
}

export interface CreateTaskRequest {
  input: Record<string, any>;
  output: Record<string, any>;
}

export interface CreateTaskResponse {
  id: string;
}