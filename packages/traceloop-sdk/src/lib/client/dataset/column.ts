import { TraceloopClient } from "../traceloop-client";
import { BaseDataset } from "./base-dataset";
import {
  ColumnResponse,
  ColumnUpdateOptions
} from "../../interfaces";

export class Column extends BaseDataset {
  private _data: ColumnResponse;

  constructor(client: TraceloopClient, data: ColumnResponse) {
    super(client);
    this._data = data;
  }

  get id(): string {
    return this._data.id;
  }

  get name(): string {
    return this._data.name;
  }

  get type(): 'string' | 'number' | 'boolean' | 'date' {
    return this._data.type;
  }

  get required(): boolean {
    return this._data.required || false;
  }

  get description(): string | undefined {
    return this._data.description;
  }

  get datasetId(): string {
    return this._data.datasetId;
  }

  get datasetSlug(): string {
    return this._data.datasetSlug;
  }

  get createdAt(): string {
    return this._data.createdAt;
  }

  get updatedAt(): string {
    return this._data.updatedAt;
  }

  async refresh(): Promise<void> {
    const response = await this.client.get(`/v2/datasets/${this.datasetSlug}/columns/${this.id}`);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async update(options: ColumnUpdateOptions): Promise<void> {
    if (options.name && typeof options.name !== 'string') {
      throw new Error('Column name must be a string');
    }

    if (options.type && !['string', 'number', 'boolean', 'date'].includes(options.type)) {
      throw new Error('Column type must be one of: string, number, boolean, date');
    }

    const response = await this.client.put(`/v2/datasets/${this.datasetSlug}/columns/${this.id}`, options);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async delete(): Promise<void> {
    const response = await this.client.delete(`/v2/datasets/${this.datasetSlug}/columns/${this.id}`);
    await this.handleResponse(response);
  }

  validateValue(value: any): boolean {
    if (this.required && (value === null || value === undefined)) {
      return false;
    }

    if (value === null || value === undefined) {
      return true;
    }

    switch (this.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      default:
        return false;
    }
  }

  convertValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (this.type) {
      case 'string':
        return String(value);
      case 'number':
        const numValue = Number(value);
        return isNaN(numValue) ? null : numValue;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1') return true;
          if (lower === 'false' || lower === '0') return false;
        }
        return Boolean(value);
      case 'date':
        if (value instanceof Date) return value;
        const dateValue = new Date(value);
        return isNaN(dateValue.getTime()) ? null : dateValue;
      default:
        return value;
    }
  }
}