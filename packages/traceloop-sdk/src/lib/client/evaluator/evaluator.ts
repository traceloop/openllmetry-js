import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "../dataset/base-dataset";
import type {
  EvaluatorRunOptions,
  TriggerEvaluatorRequest,
  TriggerEvaluatorResponse,
  InputSchemaMapping,
  CreateCustomEvaluatorRequest,
  EvaluatorUpdateRequest,
  EvaluatorExecuteOptions,
  EvaluatorCreateResponse,
  EvaluatorUpdateResponse,
  EvaluatorExecuteResponse,
  EvaluatorSource,
  EvaluatorCatalogItem,
  EvaluatorData,
  PropertySchema,
} from "../../interfaces/evaluator.interface";
import type { ExecutionResponse } from "../../interfaces/experiment.interface";

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export class Evaluator extends BaseDatasetEntity {
  constructor(client: TraceloopClient) {
    super(client);
  }

  // ─── Standalone evaluator methods ────────────────────────────────────────

  /**
   * Creates a new LLM-as-a-judge custom evaluator without binding it to any project or environment.
   * @param options The evaluator configuration including name, messages, provider, model, and schemas
   * @returns The created evaluator's ID and slug
   * @throws Error if the API request fails
   *
   * @example
   * const result = await client.evaluator.create({
   *   name: "Quality Evaluator",
   *   provider: "openai",
   *   model: "gpt-4o",
   *   messages: [
   *     { role: "system", content: "You are a strict quality evaluator." },
   *     { role: "user", content: "Evaluate: {{text}}" },
   *   ],
   *   inputSchema: [{ name: "text", type: "string" }],
   *   outputSchema: [{ name: "passed", type: "boolean" }],
   * });
   * console.log(result.id, result.slug);
   */
  async create(
    options: CreateCustomEvaluatorRequest,
  ): Promise<EvaluatorCreateResponse> {
    const payload = this.buildPayload(options);
    const response = await this.client.post("/v2/evaluators", payload);
    const data = await this.handleResponse(response);
    return {
      id: data.evaluatorId,
      slug: data.slug,
    };
  }

  /**
   * Lists all evaluators for the organization, optionally filtered by source.
   * @param source Optional filter — "custom" for user-created evaluators, "prebuilt" for Traceloop built-in evaluators, omit to get all
   * @returns Array of evaluators with their metadata and schemas
   * @throws Error if the API request fails or if an invalid source is provided
   *
   * @example
   * // Get all evaluators
   * const all = await client.evaluator.list();
   *
   * @example
   * // Get only custom evaluators
   * const custom = await client.evaluator.list("custom");
   */
  async list(source?: EvaluatorSource): Promise<EvaluatorCatalogItem[]> {
    const query = source ? `?source=${source}` : "";
    const response = await this.client.get(`/v2/evaluators${query}`);
    const data = await this.handleResponse(response);
    return (
      Array.isArray(data.evaluators) ? data.evaluators : []
    ) as EvaluatorCatalogItem[];
  }

  /**
   * Retrieves the full configuration of a single evaluator by ID or slug.
   * @param identifier The evaluator's ID (e.g. "cmb6nr...") or slug (e.g. "my-quality-evaluator")
   * @returns Full evaluator details including config, provider, model, messages, and schemas
   * @throws Error if the evaluator is not found or if the config is missing required fields
   *
   * @example
   * // Get by ID
   * const evaluator = await client.evaluator.get("cmb6nr...");
   *
   * @example
   * // Get by slug
   * const evaluator = await client.evaluator.get("my-quality-evaluator");
   * console.log(evaluator.provider, evaluator.model);
   */
  async get(identifier: string): Promise<EvaluatorData> {
    this.validateIdentifier(identifier);
    const response = await this.client.get(
      `/v2/evaluators/${encodeURIComponent(identifier)}`,
    );
    const data = await this.handleResponse(response);
    return this.toEvaluatorData(data);
  }

  /**
   * Partially updates a custom evaluator. Only the fields you provide are changed.
   * To update the LLM config (provider, model, messages, etc.), pass the full config object — it replaces the existing one.
   * @param identifier The evaluator's ID or slug
   * @param patch The fields to update — all fields are optional, but at least one must be provided
   * @returns The updated evaluator's ID
   * @throws Error if the evaluator is not found, if no fields are provided, or if the API request fails
   *
   * @example
   * // Update name only
   * await client.evaluator.update("my-quality-evaluator", { name: "Updated Name" });
   *
   * @example
   * // Update config and schemas
   * await client.evaluator.update("cmb6nr...", {
   *   provider: "anthropic",
   *   model: "claude-3-5-sonnet",
   *   messages: [{ role: "user", content: "Evaluate: {{text}}" }],
   *   inputSchema: [{ name: "text", type: "string" }],
   *   outputSchema: [{ name: "passed", type: "boolean" }],
   * });
   */
  async update(
    identifier: string,
    patch: EvaluatorUpdateRequest,
  ): Promise<EvaluatorUpdateResponse> {
    this.validateIdentifier(identifier);
    const payload: Record<string, unknown> = {};

    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.inputSchema !== undefined)
      payload.input_schema = patch.inputSchema.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        enum_values: p.enumValues,
      }));
    if (patch.outputSchema !== undefined)
      payload.output_schema = patch.outputSchema.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        enum_values: p.enumValues,
      }));

    const hasConfigField =
      patch.description !== undefined ||
      patch.provider !== undefined ||
      patch.messages !== undefined ||
      patch.model !== undefined ||
      patch.temperature !== undefined ||
      patch.maxTokens !== undefined ||
      patch.topP !== undefined ||
      patch.frequencyPenalty !== undefined ||
      patch.presencePenalty !== undefined;

    if (hasConfigField) {
      const config: Record<string, unknown> = {};
      if (patch.description !== undefined)
        config.description = patch.description;
      if (patch.provider !== undefined) config.provider = patch.provider;
      if (patch.messages !== undefined) config.messages = patch.messages;

      const hasLLMField =
        patch.model !== undefined ||
        patch.temperature !== undefined ||
        patch.maxTokens !== undefined ||
        patch.topP !== undefined ||
        patch.frequencyPenalty !== undefined ||
        patch.presencePenalty !== undefined;

      if (hasLLMField) {
        const llmConfig: Record<string, unknown> = {};
        if (patch.model !== undefined) llmConfig.model = patch.model;
        if (patch.temperature !== undefined)
          llmConfig.temperature = patch.temperature;
        if (patch.maxTokens !== undefined)
          llmConfig.max_tokens = patch.maxTokens;
        if (patch.topP !== undefined) llmConfig.top_p = patch.topP;
        if (patch.frequencyPenalty !== undefined)
          llmConfig.frequency_penalty = patch.frequencyPenalty;
        if (patch.presencePenalty !== undefined)
          llmConfig.presence_penalty = patch.presencePenalty;
        config.llm_config = llmConfig;
      }

      payload.config = config;
    }

    const response = await this.client.patch(
      `/v2/evaluators/${encodeURIComponent(identifier)}`,
      payload,
    );
    const data = await this.handleResponse(response);
    return { id: data.evaluator?.id };
  }

  /**
   * Runs an evaluator synchronously with the given input and returns the result.
   * The input keys must match the evaluator's input schema.
   * @param identifier The evaluator's ID or slug
   * @param options The execution options containing the input values
   * @returns The execution result shaped according to the evaluator's output schema
   * @throws Error if the evaluator is not found, if the input is empty, or if the API request fails
   *
   * @example
   * const result = await client.evaluator.run("my-quality-evaluator", {
   *   input: { text: "The sky is blue because of Rayleigh scattering." },
   * });
   * console.log(result.result); // { passed: true, reason: "Factually accurate." }
   */
  async run(
    identifier: string,
    options: EvaluatorExecuteOptions,
  ): Promise<EvaluatorExecuteResponse> {
    this.validateIdentifier(identifier);
    const response = await this.client.post(
      `/v2/evaluators/${encodeURIComponent(identifier)}/execute`,
      { input: options.input },
    );
    const data = await this.handleResponse(response);
    return {
      executionId: data.executionId ?? "",
      result: data,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private validateIdentifier(identifier: string): void {
    if (!identifier || !identifier.trim()) {
      throw new Error("Evaluator identifier must be a non-empty string");
    }
  }

  private buildPayload(
    options: CreateCustomEvaluatorRequest,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(options)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [
          toSnakeCase(k),
          Array.isArray(v)
            ? v.map((item) =>
                Object.fromEntries(
                  Object.entries(item as object)
                    .filter(([, iv]) => iv !== undefined)
                    .map(([ik, iv]) => [toSnakeCase(ik), iv]),
                ),
              )
            : v,
        ]),
    );
  }

  private toEvaluatorData(data: any): EvaluatorData {
    const config = data.config ?? {};
    const llmConfig = config.llmConfig ?? {};

    const provider: string = config.provider;
    const model: string = llmConfig.model;

    if (!provider)
      throw new Error("Evaluator config is missing required field: provider");
    if (!model)
      throw new Error("Evaluator config is missing required field: model");

    const toPropertySchema = (p: any): PropertySchema => ({
      name: p.name,
      type: p.type,
      description: p.description,
      enumValues: p.enumValues,
    });

    const result: EvaluatorData = {
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type ?? "",
      description: data.description ?? "",
      version: data.version,
      source: data.source,
      inputSchema: (data.inputSchema ?? []).map(toPropertySchema),
      outputSchema: (data.outputSchema ?? []).map(toPropertySchema),
      config: data.config,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      messages: config.messages ?? [],
      provider,
      model,
    };

    if (llmConfig.temperature !== undefined)
      result.temperature = llmConfig.temperature;
    if (llmConfig.maxTokens !== undefined)
      result.maxTokens = llmConfig.maxTokens;
    if (llmConfig.topP !== undefined) result.topP = llmConfig.topP;
    if (llmConfig.frequencyPenalty !== undefined)
      result.frequencyPenalty = llmConfig.frequencyPenalty;
    if (llmConfig.presencePenalty !== undefined)
      result.presencePenalty = llmConfig.presencePenalty;

    return result;
  }

  /**
   * Run evaluators on experiment task results and wait for completion
   */
  async runExperimentEvaluator(
    options: EvaluatorRunOptions,
  ): Promise<ExecutionResponse[]> {
    const {
      experimentId,
      experimentSlug,
      experimentRunId,
      taskId,
      taskResult,
      evaluator,
      waitForResults = true,
    } = options;

    this.validateEvaluatorOptions(options);

    const triggerResponse = await this.triggerExperimentEvaluator({
      experimentId,
      experimentSlug,
      experimentRunId,
      taskId,
      evaluator,
      taskResult,
    });

    if (!waitForResults) {
      return [
        {
          executionId: triggerResponse.executionId,
          result: { status: "running", startedAt: new Date().toISOString() },
        },
      ];
    }

    return this.waitForResult(
      triggerResponse.executionId,
      triggerResponse.streamUrl,
    );
  }

  /**
   * Trigger evaluator execution without waiting for results
   */
  async triggerExperimentEvaluator(
    request: TriggerEvaluatorRequest,
  ): Promise<TriggerEvaluatorResponse> {
    const {
      experimentId,
      experimentSlug,
      experimentRunId,
      taskId,
      evaluator,
      taskResult,
    } = request;

    if (!experimentSlug || !taskResult) {
      throw new Error("experimentSlug, evaluator, and taskResult are required");
    }

    // Handle string, EvaluatorWithVersion, and EvaluatorWithConfig types
    const evaluatorName =
      typeof evaluator === "string" ? evaluator : evaluator.name;
    const evaluatorVersion =
      typeof evaluator === "string" ? undefined : evaluator.version;
    // Extract config if present (EvaluatorWithConfig type)
    const evaluatorConfig =
      typeof evaluator === "object" && "config" in evaluator
        ? evaluator.config
        : undefined;

    if (!evaluatorName) {
      throw new Error("evaluator name is required");
    }

    const inputSchemaMapping = this.createInputSchemaMapping(taskResult);

    const payload: Record<string, unknown> = {
      experiment_id: experimentId,
      experiment_run_id: experimentRunId,
      evaluator_version: evaluatorVersion,
      evaluator_slug: evaluatorName,
      task_id: taskId,
      input_schema_mapping: inputSchemaMapping,
    };

    // Add evaluator config if present
    if (evaluatorConfig && Object.keys(evaluatorConfig).length > 0) {
      payload.evaluator_config = evaluatorConfig;
    }

    const response = await this.client.post(
      `/v2/experiments/${experimentSlug}/runs/${experimentRunId}/tasks/${taskId}`,
      payload,
    );
    const data = await this.handleResponse(response);

    return {
      executionId: data.executionId,
      streamUrl: data.streamUrl,
    };
  }

  /**
   * Wait for execution result via stream URL (actually JSON endpoint)
   */
  async waitForResult(
    executionId: string,
    streamUrl: string,
  ): Promise<ExecutionResponse[]> {
    if (!executionId || !streamUrl) {
      throw new Error("Execution ID and stream URL are required");
    }

    const fullStreamUrl = `${this.client["baseUrl"]}/v2${streamUrl}`;

    try {
      const response = await fetch(fullStreamUrl, {
        headers: {
          Authorization: `Bearer ${this.client["apiKey"]}`,
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get results: ${response.status}, body: ${errorText}`,
        );
      }

      const responseText = await response.text();
      const responseData = JSON.parse(responseText);

      // Check execution ID match
      if (
        responseData.execution_id &&
        responseData.execution_id !== executionId
      ) {
        throw new Error(
          `Execution ID mismatch: ${responseData.execution_id} !== ${executionId}`,
        );
      }

      // Convert to ExecutionResponse format
      const executionResponse: ExecutionResponse = {
        executionId: responseData.execution_id,
        result: responseData.result,
      };

      return [executionResponse];
    } catch (error) {
      throw new Error(
        `Failed to wait for result: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Validate evaluator run options
   */
  private validateEvaluatorOptions(options: EvaluatorRunOptions): void {
    const { experimentId, evaluator, taskResult } = options;

    if (
      !experimentId ||
      typeof experimentId !== "string" ||
      experimentId.trim().length === 0
    ) {
      throw new Error(
        "Experiment ID is required and must be a non-empty string",
      );
    }

    if (!evaluator) {
      throw new Error("At least one evaluator must be specified");
    }

    if (!taskResult) {
      throw new Error("At least one task result must be provided");
    }

    // Validate evaluator based on its type
    if (typeof evaluator === "string") {
      if (!evaluator.trim()) {
        throw new Error("Evaluator name cannot be empty");
      }
    } else {
      if (
        !evaluator.name ||
        typeof evaluator.name !== "string" ||
        !evaluator.name.trim()
      ) {
        throw new Error("Evaluator must have a valid name");
      }
    }

    // Validate each task result
    if (!taskResult || typeof taskResult !== "object") {
      throw new Error(`Task result must be a valid object`);
    }
  }

  /**
   * Create InputSchemaMapping from input object
   */
  private createInputSchemaMapping(
    input: Record<string, any>,
  ): InputSchemaMapping {
    const mapping: InputSchemaMapping = {};

    for (const [key, value] of Object.entries(input)) {
      mapping[key] = { source: String(value) };
    }

    return mapping;
  }
}
