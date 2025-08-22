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
  CreateTaskResponse,
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

  /**
   * Generate a unique experiment slug
   */
  private generateExperimentSlug(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `exp-${timestamp}${random}`.substring(0, 15);
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

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/csv") || contentType.includes("application/x-ndjson")) {
      return await response.text();
    } else {
      const rawData = await response.json();
      return transformApiResponse(rawData);
    }
  }

  /**
   * Run an experiment with the given task function and options
   */
  async run<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions = {},
  ): Promise<ExperimentRunResult> {
    const {
      datasetSlug,
      datasetVersion,
      evaluators = [],
      waitForResults = true,
    } = options;

    // When experimentSlug is not provided a random one is generated
    let { experimentSlug } = options;
    if (!experimentSlug) {
      experimentSlug =
        this.client.experimentSlug || this.generateExperimentSlug();
    }

    this.validateRunOptions(task, options);

    try {
      const evaluatorSlugs = evaluators.map((evaluator) =>
        typeof evaluator === "string" ? evaluator : evaluator.name,
      );
      const experimentResponse = await this.initializeExperiment({
        slug: experimentSlug,
        datasetSlug,
        datasetVersion,
        evaluatorSlugs,
      });
     
      const rows = await this.getDatasetRows(datasetSlug, datasetVersion);

      const taskResults: TaskResponse[] = [];
      const taskErrors: string[] = [];
      const evaluationResults: ExecutionResponse[] = [];

      for (const row of rows) {
        const taskOutput = await task(row as TInput);

        // Create TaskResponse object
        const taskResponse: TaskResponse = {
          input: row,
          output: taskOutput as Record<string, any>,
          metadata: {
            rowId: row.id,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        };

        taskResults.push(taskResponse);

        const response = await this.createTask(
          experimentSlug,
          experimentResponse.run.id,
          row,
          taskOutput as Record<string, any>,
        );
        const taskId = response.id;

        if (evaluators.length > 0) {
          for (const evaluator of evaluators) {
            const singleEvaluationResult =
              await this.evaluator.runExperimentEvaluator({
                experimentId: experimentResponse.experiment.id,
                experimentRunId: experimentResponse.run.id,
                taskId,
                evaluator,
                taskResult: taskOutput as Record<string, any>,
                waitForResults,
                timeout: 120000, // 2 minutes default
              });
            evaluationResults.push(...singleEvaluationResult);
          }
        }
      }

      const evalResults = evaluationResults.map(
        (evaluation) => evaluation.result,
      );
      return {
        taskResults: taskResults,
        errors: taskErrors,
        experimentId: experimentResponse.experiment.id,
        runId: experimentResponse.run.id,
        evaluations: evalResults,
      };
    } catch (error) {
      throw new Error(
        `Experiment execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    taskOutput: Record<string, any>,
  ): Promise<CreateTaskResponse> {
    const body: CreateTaskRequest = {
      input: taskInput,
      output: taskOutput,
    };

    const response = await this.client.post(
      `/v2/experiments/${experimentSlug}/runs/${experimentRunId}/task`,
      body,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to create task for experiment '${experimentSlug}'`,
      );
    }

    const data = await this.handleResponse(response);
    return {
      id: data.id,
    };
  }

  /**
   * Initialize a new experiment
   */
  async initializeExperiment(
    request: InitExperimentRequest,
  ): Promise<ExperimentInitResponse> {
    if (request.aux) {
      request.experimentRunMetadata = {
        ...request.experimentRunMetadata,
        aux: request.aux,
      };
    }

    if (request.relatedRef) {
      request.experimentRunMetadata = {
        ...request.experimentRunMetadata,
        related_ref: request.relatedRef,
      };
    }

    const payload = {
      slug: request.slug,
      dataset_slug: request.datasetSlug,
      dataset_version: request.datasetVersion,
      evaluator_slugs: request.evaluatorSlugs,
      experiment_metadata: request.experimentMetadata,
      experiment_run_metadata: request.experimentRunMetadata,
    };

    const response = await this.client.put(
      "/v2/experiments/initialize",
      payload,
    );
    const data = await this.handleResponse(response);

    return data;
  }

  /**
   * Parse JSONL string into list of {col_name: col_value} dictionaries
   * Skips the first line (columns definition)
   */
  private parseJsonlToRows(jsonlData: string): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    const lines = jsonlData.trim().split("\n");

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
    datasetVersion?: string,
  ): Promise<Record<string, any>[]> {
    if (!datasetSlug) {
      throw new Error("Dataset slug is required for experiment execution");
    }

    const dataset = await this.datasets.getVersionAsJsonl(
      datasetSlug,
      datasetVersion || "",
    );
    const rows = this.parseJsonlToRows(dataset);
    return rows;
  }

  /**
   * Validate experiment run options
   */
  private validateRunOptions<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions,
  ): void {
    if (!task || typeof task !== "function") {
      throw new Error("Task function is required and must be a function");
    }

    if (options.evaluators) {
      options.evaluators.forEach((evaluator, index) => {
        if (typeof evaluator === "string") {
          if (!evaluator.trim()) {
            throw new Error(
              `Evaluator at index ${index} cannot be an empty string`,
            );
          }
        } else {
          if (!evaluator || typeof evaluator !== "object") {
            throw new Error(
              `Evaluator at index ${index} must be a string or object with name and version`,
            );
          }
          if (
            !evaluator.name ||
            typeof evaluator.name !== "string" ||
            !evaluator.name.trim()
          ) {
            throw new Error(
              `Evaluator at index ${index} must have a valid non-empty name`,
            );
          }
          if (
            !evaluator.version ||
            typeof evaluator.version !== "string" ||
            !evaluator.version.trim()
          ) {
            throw new Error(
              `Evaluator at index ${index} must have a valid non-empty version`,
            );
          }
        }
      });
    }
  }
}
