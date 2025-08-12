import { TraceloopClient } from "../traceloop-client";
import { BaseDataset } from "./base-dataset";
import { Dataset } from "./dataset";
import {
  DatasetCreateOptions,
  DatasetResponse,
  DatasetListResponse,
} from "../../interfaces";

export class Datasets extends BaseDataset {
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
}
