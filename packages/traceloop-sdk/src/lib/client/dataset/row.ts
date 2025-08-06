import { TraceloopClient } from "../traceloop-client";
import { BaseDataset } from "./base-dataset";
import {
  RowResponse,
  RowData,
  RowUpdateOptions
} from "../../interfaces";

export class Row extends BaseDataset {
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
    return this._data.createdAt;
  }

  get updatedAt(): string {
    return this._data.updatedAt;
  }

  getValue(columnName: string): string | number | boolean | Date | null {
    return this._data.data[columnName] || null;
  }

  setValue(columnName: string, value: string | number | boolean | Date | null): void {
    if (!columnName || typeof columnName !== 'string') {
      throw new Error('Column name must be a non-empty string');
    }
    
    this._data.data[columnName] = value;
  }

  hasColumn(columnName: string): boolean {
    return columnName in this._data.data;
  }

  getColumns(): string[] {
    return Object.keys(this._data.data);
  }

  async refresh(): Promise<void> {
    const response = await this.client.get(`/v2/datasets/${this.datasetSlug}/rows/${this.id}`);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async update(options: RowUpdateOptions): Promise<void> {
    if (!options.data || typeof options.data !== 'object') {
      throw new Error('Update data must be a valid object');
    }

    // Merge the updates with existing data
    const updatedData = { ...this._data.data, ...options.data };

    const response = await this.client.put(`/v2/datasets/${this.datasetSlug}/rows/${this.id}`, {
      data: updatedData
    });
    
    const result = await this.handleResponse(response);
    this._data = result;
  }

  async partialUpdate(updates: Partial<RowData>): Promise<void> {
    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates must be a valid object');
    }

    // Only update specified fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        this._data.data[key] = updates[key];
      }
    });

    const response = await this.client.put(`/v2/datasets/${this.datasetSlug}/rows/${this.id}`, {
      data: updates
    });
    
    const result = await this.handleResponse(response);
    this._data = result;
  }

  async delete(): Promise<void> {
    const response = await this.client.delete(`/v2/datasets/${this.datasetSlug}/rows/${this.id}`);
    await this.handleResponse(response);
  }

  toJSON(): RowData {
    return { ...this._data.data };
  }

  toCSVRow(columns?: string[], delimiter: string = ','): string {
    const columnsToUse = columns || this.getColumns();
    const values = columnsToUse.map(column => {
      const value = this._data.data[column];
      if (value === null || value === undefined) {
        return '';
      }
      
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains delimiter or quotes
      if (stringValue.includes(delimiter) || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    });
    
    return values.join(delimiter);
  }

  validate(columnValidators?: { [columnName: string]: (value: any) => boolean }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (columnValidators) {
      Object.keys(columnValidators).forEach(columnName => {
        const validator = columnValidators[columnName];
        const value = this._data.data[columnName];
        
        if (!validator(value)) {
          errors.push(`Invalid value for column '${columnName}': ${value}`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  clone(): Row {
    const clonedData: RowResponse = {
      ...this._data,
      data: { ...this._data.data }
    };
    
    return new Row(this.client, clonedData);
  }
}