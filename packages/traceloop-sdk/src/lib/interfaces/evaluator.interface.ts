import type { EvaluatorDetails } from './experiment.interface';

export interface StreamEvent {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: any;
  timestamp: string;
  id?: string;
  event?: string;
}

export interface EvaluatorRunOptions {
  experimentId: string;
  experimentRunId?: string;
  taskId?: string;
  taskResult: Record<string, any>;
  evaluator: EvaluatorDetails;
  waitForResults?: boolean;
  timeout: number;
}


export interface EvaluatorResult {
  evaluatorName: string;
  taskId?: string;
  score?: number;
  result?: any;
  metadata?: Record<string, any>;
  error?: string;
}

export interface TriggerEvaluatorRequest {
  experimentId: string;
  experimentRunId?: string;
  taskId?: string;
  evaluator: EvaluatorDetails;
  taskResult: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TriggerEvaluatorResponse {
  executionId: string;
  streamUrl: string;
}

export interface SSEClientOptions {
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

export interface StreamProgressEvent {
  type: 'progress';
  data: {
    completed: number;
    total: number;
    percentage: number;
    currentTask?: string;
  };
}

export interface StreamResultEvent {
  type: 'result';
  data: {
    taskId: string;
    evaluatorName: string;
    result: EvaluatorResult;
  };
}

export interface StreamErrorEvent {
  type: 'error';
  data: {
    error: string;
    taskId?: string;
    evaluatorName?: string;
  };
}

export interface StreamCompleteEvent {
  type: 'complete';
  data: {
    executionId: string;
    totalResults: number;
    totalErrors: number;
    duration: number;
  };
}

export type SSEStreamEvent = StreamProgressEvent | StreamResultEvent | StreamErrorEvent | StreamCompleteEvent;

export interface InputExtractor {
  source: string;
}

export interface InputSchemaMapping {
  [key: string]: InputExtractor;
}