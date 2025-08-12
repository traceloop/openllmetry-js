import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "./base-dataset";
import { RowResponse, RowData, RowUpdateOptions } from "../../interfaces";

export class Row extends BaseDatasetEntity {
  private _data: RowResponse;

  constructor(client: TraceloopClient, data: RowResponse) {
    super(client);
    this._data = data;
  }

  get id(): string {
    return this._data.id;
  }

  get datasetId(): string {
    return this._data.datasetId;
  }

  get datasetSlug(): string {
    return this._data.datasetSlug;
  }

  get data(): RowData {
    return { ...this._data.data };
  }

  get createdAt(): string {
    return this._data.created_at;
  }

  get updatedAt(): string {
    return this._data.updated_at;
  }

  getValue(columnName: string): string | number | boolean | Date | null {
    const value = this._data.data[columnName];
    return value !== undefined ? value : null;
  }

  hasColumn(columnName: string): boolean {
    return columnName in this._data.data;
  }

  getColumns(): string[] {
    return Object.keys(this._data.data);
  }


  async update(options: RowUpdateOptions): Promise<void> {
    if (!options.data || typeof options.data !== "object") {
      throw new Error("Update data must be a valid object");
    }

    const updatedData = { ...this._data.data, ...options.data };

    const response = await this.client.put(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
      {
        Values: updatedData,
      },
    );

    const result = await this.handleResponse(response);

    if (result && result.id) {
      this._data = result;
    }
  }

  async partialUpdate(updates: Partial<RowData>): Promise<void> {
    if (!updates || typeof updates !== "object") {
      throw new Error("Updates must be a valid object");
    }

    const response = await this.client.put(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
      {
        Values: updates,
      },
    );

    const result = await this.handleResponse(response);

    if (result && result.id) {
      this._data = result;
    }
  }

  async delete(): Promise<void> {
    const response = await this.client.delete(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
    );
    await this.handleResponse(response);
  }

  toJSON(): RowData {
    return { ...this._data.data };
  }

  toCSVRow(columns?: string[], delimiter = ","): string {
    const columnsToUse = columns || this.getColumns();
    const values = columnsToUse.map((column) => {
      const value = this._data.data[column];
      if (value === null || value === undefined) {
        return "";
      }

      const stringValue = String(value);

      if (
        stringValue.includes(delimiter) ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    });

    return values.join(delimiter);
  }

  validate(columnValidators?: {
    [columnName: string]: (value: any) => boolean;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (columnValidators) {
      Object.keys(columnValidators).forEach((columnName) => {
        const validator = columnValidators[columnName];
        const value = this._data.data[columnName];

        if (!validator(value)) {
          errors.push(`Invalid value for column '${columnName}': ${value}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  clone(): Row {
    const clonedData: RowResponse = {
      ...this._data,
      data: { ...this._data.data },
    };

    return new Row(this.client, clonedData);
  }
}
