import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "../dataset/base-dataset";
import type {
  EvaluatorRunOptions,
  TriggerEvaluatorRequest,
  TriggerEvaluatorResponse,
  InputSchemaMapping
} from "../../interfaces/evaluator.interface";
import type {
  ExecutionResponse
} from "../../interfaces/experiment.interface";

export class Evaluator extends BaseDatasetEntity {

  constructor(client: TraceloopClient) {
    super(client);
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

    const triggerResponse = await this.triggerExperimentEvaluator({
      experimentId,
      experimentRunId,
      taskId,
      evaluator,
      taskResult
    });

    if (!waitForResults) {
      return [{
        executionId: triggerResponse.executionId,
        result: { status: 'running', startedAt: new Date().toISOString() }
      }];
    }

    return this.waitForResult(triggerResponse.executionId, triggerResponse.streamUrl, timeout);
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

    // Handle both string and object evaluator types
    const evaluatorName = typeof evaluator === 'string' ? evaluator : evaluator.name;
    const evaluatorVersion = typeof evaluator === 'string' ? undefined : evaluator.version;

    if (!evaluatorName) {
      throw new Error('evaluator name is required');
    }

    const inputSchemaMapping = this.createInputSchemaMapping(taskResult);

    const payload = {
      experiment_id: experimentId,  
      experiment_run_id: experimentRunId,
      evaluator_version: evaluatorVersion,
      task_id: taskId,
      input_schema_mapping: inputSchemaMapping,
    };

    const response = await this.client.post(`/v2/evaluators/slug/${evaluatorName}/execute`, payload);
    const data = await this.handleResponse(response);

    return {
      executionId: data.executionId,
      streamUrl: data.streamUrl
    };
  }


  /**
   * Wait for execution result via stream URL (actually JSON endpoint)
   */
  async waitForResult(
    executionId: string,
    streamUrl: string,
    timeout = 120000
  ): Promise<ExecutionResponse[]> {
    if (!executionId || !streamUrl) {
      throw new Error('Execution ID and stream URL are required');
    }

    console.log('waitForResult called with:', { executionId, streamUrl });

    const fullStreamUrl = `${this.client['baseUrl']}/v2${streamUrl}`;
    console.log('Full stream URL:', fullStreamUrl);

    try {
      const response = await fetch(fullStreamUrl, {
        headers: {
          'Authorization': `Bearer ${this.client['apiKey']}`,
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      console.log('waitForResult - Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get results: ${response.status}, body: ${errorText}`);
      }

      const responseText = await response.text();
      console.log('waitForResult - Response text length:', responseText.length);
      
      const responseData = JSON.parse(responseText);
      console.log('waitForResult - Parsed response:', responseData);
      
      // Check execution ID match
      if (responseData.execution_id && responseData.execution_id !== executionId) {
        throw new Error(`Execution ID mismatch: ${responseData.execution_id} !== ${executionId}`);
      }

      // Convert to ExecutionResponse format
      const executionResponse: ExecutionResponse = {
        executionId: responseData.execution_id,
        result: responseData.result
      };

      return [executionResponse];

    } catch (error) {
      throw new Error(
        `Failed to wait for result: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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

    // Validate evaluator based on its type
    if (typeof evaluator === 'string') {
      if (!evaluator.trim()) {
        throw new Error('Evaluator name cannot be empty');
      }
    } else {
      if (!evaluator.name || typeof evaluator.name !== 'string' || !evaluator.name.trim()) {
        throw new Error('Evaluator must have a valid name');
      }
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
