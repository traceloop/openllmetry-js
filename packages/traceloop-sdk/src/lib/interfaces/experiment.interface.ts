export interface ExperimentTaskFunction<TInput = any, TOutput = any> {
  (input?: TInput): Promise<TOutput> | TOutput;
}

export interface EvaluatorDetails {
  name: string;
  version?: string;
  parameters?: Record<string, any>;
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

export interface TaskResponse {
  input?: any;
  output?: any;
  evaluations?: Record<string, any>;
  error?: string;
  metadata?: Record<string, any>;
  timestamp?: number;
}

export interface ExperimentRunResult {
  results: TaskResponse[];
  errors: string[];
  experimentId?: string;
  runId?: string;
  evaluations?: ExecutionResponse[];
}

export interface InitExperimentRequest {
  datasetSlug?: string;
  datasetVersion?: string;
  experimentSlug?: string;
  relatedRef?: Record<string, string>;
  aux?: Record<string, string>;
}

export interface ExperimentInitResponse {
  id: string;
  runId: string;
  status: 'initialized' | 'running' | 'completed' | 'failed';
  createdAt: string;
}

export interface ExecutionResponse {
  id: string;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
}