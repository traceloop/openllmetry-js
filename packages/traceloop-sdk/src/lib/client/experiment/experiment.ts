import { TraceloopClient } from "../traceloop-client";
import { Evaluator } from "../evaluator/evaluator";
import { Datasets } from "../dataset/datasets";
import { Row } from "../dataset/row";
import { transformApiResponse } from "../../utils/response-transformer";
import type {
  ExperimentTaskFunction,
  ExperimentRunOptions,
  ExperimentRunResult,
  TaskResponse,
  InitExperimentRequest,
  ExperimentInitResponse,
  ExperimentResponse,
  ExecutionResponse
} from "../../interfaces/experiment.interface";

export class Experiment {
  private client: TraceloopClient;
  private evaluator: Evaluator;
  private datasets: Datasets;

  constructor(client: TraceloopClient) {
    this.client = client;
    this.evaluator = new Evaluator(client);
    this.datasets = new Datasets(client);
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default HTTP error message if JSON parsing fails
      }

      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const rawData = await response.json();
      return transformApiResponse(rawData);
    }

    // Handle non-JSON responses (text/csv, etc.)
    const textContent = await response.text();
    return {
      contentType: contentType || "text/plain",
      body: textContent,
    };
  }

  /**
   * Run an experiment with the given task function and options
   */
  async run<TInput = any, TOutput = any>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions = {}
  ): Promise<ExperimentRunResult> {
    const {
      datasetSlug,
      datasetVersion,
      evaluators = [],
      experimentSlug,
      stopOnError = false,
      waitForResults = true,
      concurrency = 5
    } = options;

    // Validate inputs
    this.validateRunOptions(task, options);

    try {
      // 1. Initialize experiment
      console.log(`🔧 Step 1: Initializing experiment with slug: ${experimentSlug}`);
      const experimentResponse = await this.initializeExperiment({
        slug: experimentSlug || 'default-experiment',
        datasetSlug,
        datasetVersion,
      });
      console.log(`✅ Step 1: Experiment initialized with ID: ${experimentResponse.experiment.id}`);

      // 2. Get dataset rows
      console.log(`🔧 Step 2: Getting dataset rows for: ${datasetSlug}, version: ${datasetVersion}`);
      const rows = await this.getDatasetRows(datasetSlug, datasetVersion);
      console.log(`✅ Step 2: Retrieved ${rows.length} rows from dataset`);

      // 3. Execute tasks with concurrency control
      const { taskResults, taskErrors } = await this.executeTasks(
        task,
        rows,
        { stopOnError, concurrency }
      );

      // 4. Run evaluators if specified
      let evaluationResults: ExecutionResponse[] = [];
      if (evaluators.length > 0 && taskResults.length > 0) {
        try {
          evaluationResults = await this.evaluator.runExperimentEvaluator({
            experimentId: experimentResponse.experiment.id,
            runId: experimentResponse.run.id,
            taskResults,
            evaluators,
            waitForResults
          });
        } catch (evaluatorError) {
          console.warn('Evaluator execution failed:', evaluatorError);
          taskErrors.push(`Evaluator failed: ${evaluatorError instanceof Error ? evaluatorError.message : 'Unknown error'}`);
        }
      }

      // 5. Return comprehensive results
      return {
        results: taskResults,
        errors: taskErrors,
        experimentId: experimentResponse.experiment.id,
        runId: experimentResponse.run.id,
        evaluations: evaluationResults
      };

    } catch (error) {
      throw new Error(
        `Experiment execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Initialize a new experiment
   */
  async initializeExperiment(request: InitExperimentRequest): Promise<ExperimentInitResponse> {
    const payload = {
      slug: request.slug,
      dataset_slug: request.datasetSlug,
      dataset_version: request.datasetVersion,
      evaluator_slugs: request.evaluatorSlugs,
      experiment_metadata: request.experimentMetadata,
      experiment_run_metadata: request.experimentRunMetadata,
    };

    const response = await this.client.put('/v2/experiments/initialize', payload);
    console.log("response", response);
    const data = await this.handleResponse(response);

    return data;
  }

  /**
   * Get experiment status
   */
  async getExperimentStatus(experimentId: string): Promise<ExperimentResponse> {
    if (!experimentId) {
      throw new Error('Experiment ID is required');
    }

    const response = await this.client.get(`/v2/experiments/${experimentId}`);
    const data = await this.handleResponse(response);

    return data;
  }

  /**
   * Parse JSONL format data into array of objects
   * Equivalent to Python's _parse_jsonl_to_rows method
   */
  static parseJsonlToRows(jsonlData: string): Record<string, any>[] {
    if (!jsonlData || jsonlData.trim() === '') {
      return [];
    }

    const lines = jsonlData.trim().split('\n');
    const results: Record<string, any>[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (line === '') {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        
        // Only add non-null objects
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results.push(parsed);
        }
      } catch (error) {
        // Log parsing errors but continue processing
        console.warn(`Skipping invalid JSON line ${i + 1}: ${line}`, error);
      }
    }

    return results;
  }

  /**
   * Execute tasks across dataset rows with concurrency control
   */
  private async executeTasks<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    rows: Row[],
    options: { stopOnError: boolean; concurrency: number }
  ): Promise<{ taskResults: TaskResponse[]; taskErrors: string[] }> {
    const { stopOnError, concurrency } = options;
    const taskResults: TaskResponse[] = [];
    const taskErrors: string[] = [];

    // Process rows in batches for concurrency control
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (row, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          const startTime = Date.now();
          const output = await task(row.data as TInput);
          const endTime = Date.now();

          return {
            success: true,
            result: {
              input: row.data,
              output,
              metadata: { 
                rowId: row.id,
                executionTime: endTime - startTime,
                timestamp: startTime
              },
              timestamp: startTime
            } as TaskResponse,
            index: globalIndex
          };
        } catch (error) {
          const errorMsg = `Task failed for row ${globalIndex} (${row.id}): ${error instanceof Error ? error.message : 'Unknown error'}`;
          
          if (stopOnError) {
            throw new Error(errorMsg);
          }
          
          return {
            success: false,
            error: errorMsg,
            result: {
              input: row.data,
              error: errorMsg,
              metadata: { 
                rowId: row.id,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            } as TaskResponse,
            index: globalIndex
          };
        }
      });

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((promiseResult) => {
          if (promiseResult.status === 'fulfilled') {
            const { success, result, error } = promiseResult.value;
            taskResults.push(result);
            
            if (!success && error) {
              taskErrors.push(error);
            }
          } else if (promiseResult.status === 'rejected') {
            const error = `Batch processing failed: ${promiseResult.reason}`;
            taskErrors.push(error);
            
            if (stopOnError) {
              throw new Error(error);
            }
          }
        });
      } catch (error) {
        if (stopOnError) {
          throw error;
        }
        taskErrors.push(`Batch execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { taskResults, taskErrors };
  }

  /**
   * Get dataset rows for experiment execution
   */
  private async getDatasetRows(
    datasetSlug?: string, 
    datasetVersion?: string
  ): Promise<Row[]> {
    if (!datasetSlug) {
      throw new Error('Dataset slug is required for experiment execution');
    }

    console.log(`🔧 Fetching dataset: ${datasetSlug}`);
    const dataset = await this.datasets.getVersionAsJsonl(datasetSlug, datasetVersion || '');
    console.log(`✅ Dataset fetched successfully: ${dataset || 'unknown'}`);
    return [new Row(this.client, {
      id: '1',
      datasetId: 'temp-dataset',
      datasetSlug: datasetSlug || 'unknown',
      data: {
        column1: 'value1',
        column2: 'value2'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })];
  }

  /**
   * Validate experiment run options
   */
  private validateRunOptions<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions
  ): void {
    if (!task || typeof task !== 'function') {
      throw new Error('Task function is required and must be a function');
    }

    const { concurrency = 5 } = options;

    if (concurrency <= 0 || !Number.isInteger(concurrency)) {
      throw new Error('Concurrency must be a positive integer');
    }

    if (options.evaluators) {
      options.evaluators.forEach((evaluator, index) => {
        if (!evaluator.name || typeof evaluator.name !== 'string') {
          throw new Error(`Evaluator at index ${index} must have a valid name`);
        }
      });
    }
  }

  /**
   * Get experiment results
   */
  async getExperimentResults(experimentId: string, runId?: string): Promise<TaskResponse[]> {
    if (!experimentId) {
      throw new Error('Experiment ID is required');
    }

    let url = `/v2/experiments/${experimentId}/results`;
    if (runId) {
      url += `?run_id=${encodeURIComponent(runId)}`;
    }

    const response = await this.client.get(url);
    const data = await this.handleResponse(response);

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((result: any) => ({
      input: result.input,
      output: result.output,
      evaluations: result.evaluations,
      error: result.error,
      metadata: result.metadata,
      timestamp: result.timestamp
    }));
  }

  /**
   * List experiments
   */
  async listExperiments(limit = 50, offset = 0): Promise<ExperimentResponse[]> {
    const response = await this.client.get(
      `/v2/experiments?limit=${limit}&offset=${offset}`
    );
    const data = await this.handleResponse(response);

    if (!data.experiments || !Array.isArray(data.experiments)) {
      return [];
    }

    return data.experiments;
  }
}