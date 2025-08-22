import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "./base-dataset";
import { Dataset } from "./dataset";
import {
  DatasetCreateOptions,
  DatasetResponse,
  DatasetListResponse,
} from "../../interfaces";

export class Datasets extends BaseDatasetEntity {
  constructor(client: TraceloopClient) {
    super(client);
  }

  async create(options: DatasetCreateOptions): Promise<Dataset> {
    this.validateDatasetName(options.name);

    const response = await this.client.post("/v2/datasets", options);
    const data: DatasetResponse = await this.handleResponse(response);

    return new Dataset(this.client, data);
  }

  async get(slug: string): Promise<Dataset> {
    this.validateDatasetSlug(slug);

    const response = await this.client.get(`/v2/datasets/${slug}`);
    const data: DatasetResponse = await this.handleResponse(response);

    return new Dataset(this.client, data);
  }

  async list(): Promise<DatasetListResponse> {
    const response = await this.client.get(`/v2/datasets`);
    const data: DatasetListResponse = await this.handleResponse(response);

    if (!data || !data.datasets) {
      return {
        datasets: [],
        total: 0,
      };
    }

    const datasets = data.datasets.map(
      (datasetData) => new Dataset(this.client, datasetData),
    );

    return {
      ...data,
      datasets,
    };
  }

  async delete(slug: string): Promise<void> {
    this.validateDatasetSlug(slug);

    const response = await this.client.delete(`/v2/datasets/${slug}`);
    await this.handleResponse(response);
  }

  async getVersionCSV(slug: string, version: string): Promise<string> {
    this.validateDatasetSlug(slug);

    if (!version || typeof version !== "string") {
      throw new Error("Version must be a non-empty string");
    }

    const response = await this.client.get(
      `/v2/datasets/${slug}/versions/${version}`,
    );
    const csvData = await this.handleResponse(response);

    if (typeof csvData !== "string") {
      throw new Error("Expected CSV data as string from API");
    }

    return csvData;
  }

  async getVersionAsJsonl(slug: string, version: string): Promise<string> {
    if (!version || version === "") {
      throw new Error("Version is required");
    }

    const url = `/v2/datasets/${slug}/versions/${version}/jsonl`;

    const response = await this.client.get(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch JSONL data: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      // If server returns JSON, handle it appropriately
      const jsonData = await response.json();
      if (jsonData.error) {
        throw new Error(jsonData.error);
      }
      // Convert JSON response to JSONL format if needed
      if (Array.isArray(jsonData)) {
        return jsonData.map(item => JSON.stringify(item)).join('\n');
      }
      return JSON.stringify(jsonData);
    }

    // Expect JSONL format (text/plain or application/jsonl)
    return await response.text();
  }
}
