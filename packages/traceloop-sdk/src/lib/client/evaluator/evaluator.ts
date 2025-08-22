import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "../dataset/base-dataset";
import { SSEClient } from "../stream/sse-client";
import type {
  EvaluatorRunOptions,
  EvaluatorResult,
  TriggerEvaluatorRequest,
  TriggerEvaluatorResponse,
  StreamEvent,
  SSEStreamEvent,
  InputSchemaMapping
} from "../../interfaces/evaluator.interface";
import type {
  ExecutionResponse
} from "../../interfaces/experiment.interface";

export class Evaluator extends BaseDatasetEntity {
  private sseClient: SSEClient;

  constructor(client: TraceloopClient) {
    super(client);
    this.sseClient = new SSEClient(client);
  }

  /**
   * Run evaluators on experiment task results and wait for completion
   */
  async runExperimentEvaluator(
    options: EvaluatorRunOptions,
  ): Promise<ExecutionResponse[]> {
    const { 
      experimentId, 
      experimentRunId,
      taskId,
      taskResult, 
      evaluator, 
      waitForResults = true,
      timeout = 120000 // 2 minutes default
    } = options;

    this.validateEvaluatorOptions(options);

    // Trigger the evaluator execution
    const triggerResponse = await this.triggerExperimentEvaluator({
      experimentId,
      experimentRunId,
      taskId,
      evaluator,
      taskResult
    });

    if (!waitForResults) {
      // Return immediately with execution ID
      return [{
        id: triggerResponse.executionId,
        status: 'running',
        startedAt: new Date().toISOString()
      }];
    }

    // Stream results until completion
    return this.streamEvaluatorResults(triggerResponse.executionId, timeout);
  }

  /**
   * Trigger evaluator execution without waiting for results
   */
  async triggerExperimentEvaluator(
    request: TriggerEvaluatorRequest
  ): Promise<TriggerEvaluatorResponse> {
    const { experimentId, experimentRunId, taskId, evaluator, taskResult } = request;

    if (!experimentId || !taskResult) {
      throw new Error('experimentId, evaluator, and taskResult are required');
    }

    const inputSchemaMapping = this.createInputSchemaMapping(taskResult);

    const payload = {
      experiment_id: experimentId,  
      experiment_run_id: experimentRunId,
      evaluator_version: evaluator.version,
      task_id: taskId,
      input_schema_mapping: inputSchemaMapping,
    };

    const response = await this.client.post(`/v2/evaluators/slug/${evaluator.name}/execute`, payload);
    const data = await this.handleResponse(response);

    return {
      executionId: data.executionId,
      streamUrl: data.streamUrl
    };
  }

  /**
   * Get evaluator execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionResponse> {
    if (!executionId) {
      throw new Error('Execution ID is required');
    }

    const response = await this.client.get(`/v2/evaluators/executions/${executionId}`);
    const data = await this.handleResponse(response);

    return {
      id: data.id || executionId,
      status: data.status,
      result: data.result,
      error: data.error,
      progress: data.progress,
      startedAt: data.started_at || data.startedAt,
      completedAt: data.completed_at || data.completedAt
    };
  }

  /**
   * Stream evaluator execution results in real-time
   */
  async streamEvaluatorResults(
    executionId: string,
    timeout: number = 120000
  ): Promise<ExecutionResponse[]> {
    if (!executionId) {
      throw new Error('Execution ID is required');
    }

    const results: ExecutionResponse[] = [];
    const url = `/v2/evaluators/events/${executionId}`;

    try {
      const eventStream = this.sseClient.streamEvents(url, { timeout });
      const iterator = eventStream[Symbol.asyncIterator]();
      
      while (true) {
        const { done, value: event } = await iterator.next();
        if (done) break;

        const processedEvent = this.processStreamEvent(event, executionId);
        
        if (processedEvent) {
          results.push(processedEvent);
          
          // Break on completion or error
          if (processedEvent.status === 'completed' || processedEvent.status === 'failed') {
            break;
          }
        }
      }

      if (results.length === 0) {
        throw new Error('No results received from evaluator stream');
      }

      return results;
    } catch (error) {
      throw new Error(
        `Failed to stream evaluator results: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a typed stream for evaluator events
   */
  async *streamEvaluatorEvents(
    executionId: string,
    timeout: number = 120000
  ): AsyncIterable<SSEStreamEvent> {
    const url = `/v2/evaluators/executions/${executionId}/stream`;
    
    const eventStream = this.sseClient.createTypedStream<SSEStreamEvent>(url, { timeout });
    const iterator = eventStream[Symbol.asyncIterator]();
    
    while (true) {
      const { done, value: event } = await iterator.next();
      if (done) break;
      yield event;
    }
  }

  /**
   * Cancel a running evaluator execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    if (!executionId) {
      throw new Error('Execution ID is required');
    }

    const response = await this.client.delete(`/v2/evaluators/executions/${executionId}`);
    await this.handleResponse(response);
  }

  /**
   * Get results from a completed evaluator execution
   */
  async getExecutionResults(executionId: string): Promise<EvaluatorResult[]> {
    if (!executionId) {
      throw new Error('Execution ID is required');
    }

    const response = await this.client.get(`/v2/evaluators/executions/${executionId}/results`);
    const data = await this.handleResponse(response);

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((result: any) => ({
      evaluatorName: result.evaluator_name || result.evaluatorName,
      taskId: result.task_id || result.taskId,
      score: result.score,
      result: result.result,
      metadata: result.metadata,
      error: result.error
    }));
  }

  /**
   * List available evaluators
   */
  async listAvailableEvaluators(): Promise<Array<{ name: string; version: string; description?: string }>> {
    const response = await this.client.get('/v2/evaluators');
    const data = await this.handleResponse(response);

    if (!data.evaluators || !Array.isArray(data.evaluators)) {
      return [];
    }

    return data.evaluators.map((evaluator: any) => ({
      name: evaluator.name,
      version: evaluator.version,
      description: evaluator.description
    }));
  }

  /**
   * Process a stream event into an ExecutionResponse
   */
  private processStreamEvent(event: StreamEvent, executionId: string): ExecutionResponse | null {
    try {
      const eventData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      switch (event.type) {
        case 'progress':
          return {
            id: executionId,
            status: 'running',
            progress: eventData.percentage || eventData.progress,
            result: eventData
          };

        case 'result':
          return {
            id: executionId,
            status: eventData.status || 'running',
            result: eventData.result || eventData,
            progress: eventData.progress || 100
          };

        case 'complete':
          return {
            id: executionId,
            status: 'completed',
            result: eventData.result || eventData,
            progress: 100,
            completedAt: event.timestamp
          };

        case 'error':
          return {
            id: executionId,
            status: 'failed',
            error: eventData.error || 'Unknown error',
            completedAt: event.timestamp
          };

        default:
          return null;
      }
    } catch (error) {
      console.warn('Failed to process stream event:', event, error);
      return null;
    }
  }

  /**
   * Validate evaluator run options
   */
  private validateEvaluatorOptions(options: EvaluatorRunOptions): void {
    const { experimentId, evaluator, taskResult } = options;

    if (!experimentId || typeof experimentId !== 'string' || experimentId.trim().length === 0) {
      throw new Error('Experiment ID is required and must be a non-empty string');
    }

    if (!evaluator) {
      throw new Error('At least one evaluator must be specified');
    }

    if (!taskResult) {
      throw new Error('At least one task result must be provided');
    }

    // Validate each evaluator
    if (!evaluator.name || typeof evaluator.name !== 'string') {
      throw new Error(`Evaluator must have a valid name`);
    }

    // Validate each task result
    if (!taskResult || typeof taskResult !== 'object') {
      throw new Error(`Task result must be a valid object`);
    }
  }

    /**
   * Create InputSchemaMapping from input object
   */
    private createInputSchemaMapping(input: Record<string, any>): InputSchemaMapping {
      const mapping: InputSchemaMapping = {};
      
      for (const [key, value] of Object.entries(input)) {
        mapping[key] = { source: String(value) };
      }
      
      return mapping;
    }
    
}