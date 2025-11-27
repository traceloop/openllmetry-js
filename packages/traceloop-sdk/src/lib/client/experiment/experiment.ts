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
  GithubContext,
  TaskResult,
  RunInGithubOptions,
  RunInGithubResponse,
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

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();
    if (
      contentType.includes("text/csv") ||
      contentType.includes("application/x-ndjson")
    ) {
      return await response.text();
    } else {
      const rawData = await response.json();
      return transformApiResponse(rawData);
    }
  }

  /**
   * Run an experiment with the given task function and options
   * If running in GitHub Actions, will automatically run in GitHub context.
   * Otherwise, will run the experiment locally.
   */
  async run<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: ExperimentRunOptions = {},
  ): Promise<ExperimentRunResult | RunInGithubResponse> {
    // Check if running in GitHub Actions
    if (process.env.GITHUB_ACTIONS === "true") {
      return await this.runInGithub(task, {
        datasetSlug: options.datasetSlug || "",
        datasetVersion: options.datasetVersion,
        evaluators: options.evaluators,
        experimentSlug: options.experimentSlug,
        experimentMetadata: options.relatedRef ? { ...options.aux, created_from: "github" } : { created_from: "github" },
        experimentRunMetadata: {
          ...(options.relatedRef && { related_ref: options.relatedRef }),
          ...(options.aux && { aux: options.aux }),
        },
      });
    }

    return await this.runLocally(task, options);
  }

  /**
   * Run an experiment locally (not in GitHub Actions)
   */
  private async runLocally<TInput, TOutput>(
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

  /**
   * Extract GitHub Actions context from environment variables
   */
  private getGithubContext(): GithubContext {
    const repository = process.env.GITHUB_REPOSITORY;
    const ref = process.env.GITHUB_REF;
    const sha = process.env.GITHUB_SHA;
    const actor = process.env.GITHUB_ACTOR;

    if (!repository || !ref || !sha || !actor) {
      throw new Error(
        "Missing required GitHub environment variables: GITHUB_REPOSITORY, GITHUB_REF, GITHUB_SHA, or GITHUB_ACTOR",
      );
    }

    // Extract PR number from ref (e.g., refs/pull/123/merge -> 123)
    const prMatch = ref.match(/refs\/pull\/(\d+)\//);
    const prNumber = prMatch ? prMatch[1] : null;

    if (!prNumber) {
      throw new Error(
        `This method can only be run on pull request events. Current ref: ${ref}`,
      );
    }

    const prUrl = `https://github.com/${repository}/pull/${prNumber}`;

    return {
      repository,
      prUrl,
      commitHash: sha,
      actor,
    };
  }

  /**
   * Execute tasks locally and capture results
   */
  private async executeTasksLocally<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    rows: Record<string, any>[],
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const row of rows) {
      try {
        const output = await task(row as TInput);
        results.push({
          input: row,
          output: output as Record<string, any>,
          metadata: {
            rowId: row.id,
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        results.push({
          input: row,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            rowId: row.id,
            timestamp: Date.now(),
          },
        });
      }
    }

    return results;
  }

  /**
   * Run an experiment in GitHub Actions environment
   * This method executes tasks locally and submits results to the backend for evaluation
   */
  async runInGithub<TInput, TOutput>(
    task: ExperimentTaskFunction<TInput, TOutput>,
    options: RunInGithubOptions,
  ): Promise<RunInGithubResponse> {
    const {
      datasetSlug,
      datasetVersion,
      evaluators = [],
      experimentMetadata,
      experimentRunMetadata,
    } = options;

    // Generate or use provided experiment slug
    let { experimentSlug } = options;
    if (!experimentSlug) {
      experimentSlug =
        this.client.experimentSlug || this.generateExperimentSlug();
    }

    // Validate task function
    if (!task || typeof task !== "function") {
      throw new Error("Task function is required and must be a function");
    }

    try {
      // Get GitHub context
      const githubContext = this.getGithubContext();

      // Get dataset rows
      const rows = await this.getDatasetRows(datasetSlug, datasetVersion);

      // Execute tasks locally
      const taskResults = await this.executeTasksLocally(task, rows);

      // Prepare evaluator slugs
      const evaluatorSlugs = evaluators.map((evaluator) =>
        typeof evaluator === "string" ? evaluator : evaluator.name,
      );

      // Add created_from to experiment metadata
      const mergedExperimentMetadata = {
        ...experimentMetadata,
        created_from: "github",
      };

      // Submit to backend
      const payload = {
        experiment_slug: experimentSlug,
        dataset_slug: datasetSlug,
        dataset_version: datasetVersion,
        evaluator_slugs: evaluatorSlugs,
        task_results: taskResults,
        github_context: {
          repository: githubContext.repository,
          pr_url: githubContext.prUrl,
          commit_hash: githubContext.commitHash,
          actor: githubContext.actor,
        },
        experiment_metadata: mergedExperimentMetadata,
        experiment_run_metadata: experimentRunMetadata,
      };

      const response = await this.client.post(
        "/v2/experiments/run-in-github",
        payload,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to submit GitHub experiment: ${response.status} ${response.statusText}`,
        );
      }

      const data = await this.handleResponse(response);

      return {
        experimentId: data.experimentId || data.experiment_id,
        experimentSlug: data.experimentSlug || data.experiment_slug || experimentSlug,
        runId: data.runId || data.run_id,
      };
    } catch (error) {
      throw new Error(
        `GitHub experiment execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
