import { TraceloopClient } from "../traceloop-client";
import { Evaluator } from "../evaluator/evaluator";
import { Datasets } from "../dataset/datasets";
import { transformApiResponse } from "../../utils/response-transformer";
import type {
  ExperimentTaskFunction,
  ExperimentRunOptions,
  ExperimentRunResult,
  TaskResponse,
  InitExperimentRequest,
  ExperimentInitResponse,
  ExecutionResponse,
  CreateTaskRequest,
  CreateTaskResponse
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
  async run<TInput = Record<string, any>, TOutput = Record<string, any>>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions = {}
  ): Promise<ExperimentRunResult> {
    const {
      datasetSlug,
      datasetVersion,
      evaluators = [],
      experimentSlug,
      waitForResults = true,
    } = options;

    // Validate inputs
    this.validateRunOptions(task, options);

    try {
      if (!experimentSlug) {
        throw new Error('Experiment slug is required'); // TODO nina
      }

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

      const taskResults: TaskResponse[] = [];
      const taskErrors: string[] = [];
      let evaluationResults: ExecutionResponse[] = [];

      const rows_debug = rows.slice(0, 2); // TODO nina
      for (const row of rows_debug) {
        const taskOutput = await task(row as TInput);

        // Create TaskResponse object
        const taskResponse: TaskResponse = {
          input: row,
          output: taskOutput as Record<string, any>,
          metadata: { 
            rowId: row.id,
            timestamp: Date.now()
          },
          timestamp: Date.now()
        };

        // Add to results array
        taskResults.push(taskResponse);

        // Create task
        const response = await this.createTask(
          experimentSlug,
          experimentResponse.run.id,
          row,
          taskOutput as Record<string, any>
        );
        const taskId = response.id;
        
        if (evaluators.length > 0) {
          for (const evaluator of evaluators) {
            const singleEvaluationResult = await this.evaluator.runExperimentEvaluator({
              experimentId: experimentResponse.experiment.id,
              experimentRunId: experimentResponse.run.id,
              taskId,
              evaluator,
              taskResult: taskOutput as Record<string, any>,
              waitForResults,
              timeout: 120000 // 2 minutes default
            });
            evaluationResults.push(...singleEvaluationResult);
          }
        }
      }

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
   * Create a task for the experiment
   */
  async createTask(
    experimentSlug: string,
    experimentRunId: string,
    taskInput: Record<string, any>,
    taskOutput: Record<string, any>
  ): Promise<CreateTaskResponse> {
    const body: CreateTaskRequest = {
      input: taskInput,
      output: taskOutput
    };

    const response = await this.client.post(
      `/v2/experiments/${experimentSlug}/runs/${experimentRunId}/task`,
      body
    );

    if (!response.ok) {
      throw new Error(`Failed to create task for experiment '${experimentSlug}'`);
    }

    const data = await this.handleResponse(response);
    return {
      id: data.id
    };
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
   * Parse JSONL string into list of {col_name: col_value} dictionaries
   * Skips the first line (columns definition)
   */
  private parseJsonlToRows(jsonlData: string): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    const lines = jsonlData.trim().split('\n');

    // Skip the first line (columns definition)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line) {
        try {
          const rowData = JSON.parse(line);
          rows.push(rowData);
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
    }

    return rows;
  }


  /**
   * Get dataset rows for experiment execution
   */
  private async getDatasetRows(
    datasetSlug?: string, 
    datasetVersion?: string
  ): Promise<Record<string, any>[]> {
    if (!datasetSlug) {
      throw new Error('Dataset slug is required for experiment execution');
    }

    console.log(`🔧 Fetching dataset: ${datasetSlug}`);
    const dataset = await this.datasets.getVersionAsJsonl(datasetSlug, datasetVersion || '');
    const rows = this.parseJsonlToRows(dataset);
    console.log(`✅ Dataset fetched successfully: ${rows || 'unknown'}`);
    return rows;
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

}
