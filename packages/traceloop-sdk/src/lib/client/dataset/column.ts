import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "./base-dataset";
import { ColumnResponse, ColumnUpdateOptions } from "../../interfaces";

export class Column extends BaseDatasetEntity {
  private _data: ColumnResponse;
  private _deleted: boolean = false;

  constructor(client: TraceloopClient, data: ColumnResponse) {
    super(client);
    this._data = data;
  }

  get slug(): string {
    return this._data.slug;
  }

  get name(): string {
    return this._data.name;
  }

  get type(): "string" | "number" | "boolean" | "date" {
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
    return this._data.created_at;
  }

  get updatedAt(): string {
    return this._data.updated_at;
  }

  get deleted(): boolean {
    return this._deleted;
  }

  async update(options: ColumnUpdateOptions): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot update a deleted column");
    }

    if (options.name && typeof options.name !== "string") {
      throw new Error("Column name must be a string");
    }

    if (
      options.type &&
      !["string", "number", "boolean"].includes(options.type)
    ) {
      throw new Error("Column type must be one of: string, number, boolean");
    }

    const response = await this.client.put(
      `/v2/datasets/${this.datasetSlug}/columns/${this.slug}`,
      options,
    );
    const data = await this.handleResponse(response);

    // API returns dataset data, extract column info if available
    if (data.columns && data.columns[this.slug]) {
      const columnData = data.columns[this.slug];
      // Update only the fields that changed, preserve datasetSlug and other metadata
      this._data = {
        ...this._data,
        name: columnData.name || this._data.name,
        type: columnData.type || this._data.type,
        description: columnData.description || this._data.description,
        updated_at: data.updated_at || this._data.updated_at,
      };
    }
  }

  async delete(): Promise<void> {
    if (this._deleted) {
      throw new Error("Column is already deleted");
    }

    const response = await this.client.delete(
      `/v2/datasets/${this.datasetSlug}/columns/${this.slug}`,
    );
    await this.handleResponse(response);
    this._deleted = true;
  }

  validateValue(value: any): boolean {
    if (this.required && (value === null || value === undefined)) {
      return false;
    }

    if (value === null || value === undefined) {
      return true;
    }

    switch (this.type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value) && isFinite(value);
      case "boolean":
        return typeof value === "boolean";
      default:
        return false;
    }
  }

  convertValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (this.type) {
      case "string":
        return String(value);
      case "number": {
        const numValue = Number(value);
        return isNaN(numValue) ? null : numValue;
      }
      case "boolean":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const lower = value.toLowerCase();
          if (lower === "true" || lower === "1") return true;
          if (lower === "false" || lower === "0") return false;
        }
        return Boolean(value);
      case "date": {
        if (value instanceof Date) return value;
        const dateValue = new Date(value);
        return isNaN(dateValue.getTime()) ? null : dateValue;
      }
      default:
        return value;
    }
  }
}
