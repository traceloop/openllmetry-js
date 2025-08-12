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

  async list(page = 1, limit = 50): Promise<DatasetListResponse> {
    if (page < 1) {
      throw new Error("Page must be greater than 0");
    }

    if (limit < 1 || limit > 100) {
      throw new Error("Limit must be between 1 and 100");
    }

    const response = await this.client.get(
      `/v2/datasets?page=${page}&limit=${limit}`,
    );
    const data: DatasetListResponse = await this.handleResponse(response);

    if (!data || !data.datasets) {
      return {
        datasets: [],
        total: 0,
        page: page,
        limit: limit,
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

  async findByName(name: string): Promise<Dataset | null> {
    this.validateDatasetName(name);

    const response = await this.client.get(
      `/v2/datasets?name=${encodeURIComponent(name)}`,
    );
    const data: DatasetListResponse = await this.handleResponse(response);

    if (!data || !data.datasets || data.datasets.length === 0) {
      return null;
    }

    return new Dataset(this.client, data.datasets[0]);
  }
}
