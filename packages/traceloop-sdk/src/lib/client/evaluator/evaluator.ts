import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "../dataset/base-dataset";
import { SSEClient } from "../stream/sse-client";
import type {
  EvaluatorRunOptions,
  EvaluatorResult,
  TriggerEvaluatorRequest,
  TriggerEvaluatorResponse,
  StreamEvent,
  SSEStreamEvent
} from "../../interfaces/evaluator.interface";
import type {
  ExecutionResponse,
  TaskResponse
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
    options: EvaluatorRunOptions
  ): Promise<ExecutionResponse[]> {
    const { 
      experimentId, 
      runId,
      taskResults, 
      evaluators, 
      waitForResults = true,
      timeout = 120000 // 2 minutes default
    } = options;

    this.validateEvaluatorOptions(options);

    // Trigger the evaluator execution
    const triggerResponse = await this.triggerExperimentEvaluator({
      experimentId,
      runId,
      evaluators,
      taskResults
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
    const { experimentId, runId, evaluators, taskResults, metadata } = request;

    if (!experimentId || !evaluators?.length || !taskResults?.length) {
      throw new Error('experimentId, evaluators, and taskResults are required');
    }

    const payload = {
      experiment_id: experimentId,
      run_id: runId,
      evaluators: evaluators.map(evaluator => ({
        name: evaluator.name,
        version: evaluator.version,
        parameters: evaluator.parameters
      })),
      task_results: taskResults.map(result => ({
        input: result.input,
        output: result.output,
        metadata: result.metadata,
        timestamp: result.timestamp
      })),
      metadata
    };

    const response = await this.client.post('/v2/evaluators/trigger', payload);
    const data = await this.handleResponse(response);

    return {
      executionId: data.execution_id || data.executionId,
      status: data.status || 'triggered',
      estimatedDuration: data.estimated_duration || data.estimatedDuration
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
    const url = `/v2/evaluators/executions/${executionId}/stream`;

    try {
      for await (const event of this.sseClient.streamEvents(url, { timeout })) {
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
    
    for await (const event of this.sseClient.createTypedStream<SSEStreamEvent>(url, { timeout })) {
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
    const { experimentId, evaluators, taskResults } = options;

    if (!experimentId || typeof experimentId !== 'string' || experimentId.trim().length === 0) {
      throw new Error('Experiment ID is required and must be a non-empty string');
    }

    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      throw new Error('At least one evaluator must be specified');
    }

    if (!taskResults || !Array.isArray(taskResults) || taskResults.length === 0) {
      throw new Error('At least one task result must be provided');
    }

    // Validate each evaluator
    evaluators.forEach((evaluator, index) => {
      if (!evaluator.name || typeof evaluator.name !== 'string') {
        throw new Error(`Evaluator at index ${index} must have a valid name`);
      }
    });

    // Validate each task result
    taskResults.forEach((result, index) => {
      if (!result || typeof result !== 'object') {
        throw new Error(`Task result at index ${index} must be a valid object`);
      }
    });
  }
}