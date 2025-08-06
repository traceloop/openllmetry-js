import { TraceloopClient } from "../traceloop-client";
import { BaseDataset } from "./base-dataset";
import {
  DatasetResponse,
  DatasetUpdateOptions,
  ColumnDefinition,
  RowData,
  DatasetPublishOptions,
  CSVImportOptions,
  DatasetStats,
  ColumnResponse,
  RowResponse,
  DatasetVersionsResponse,
  DatasetVersion
} from "../../interfaces";

export class Dataset extends BaseDataset {
  private _data: DatasetResponse;

  constructor(client: TraceloopClient, data: DatasetResponse) {
    super(client);
    this._data = data;
  }

  get id(): string {
    return this._data.id;
  }

  get slug(): string {
    return this._data.slug;
  }

  get name(): string {
    return this._data.name;
  }

  get description(): string | undefined {
    return this._data.description;
  }

  get version(): number | undefined {
    return this._data.version;
  }

  get published(): boolean {
    return this._data.published || false;
  }

  get createdAt(): string {
    return this._data.createdAt;
  }

  get updatedAt(): string {
    return this._data.updatedAt;
  }

  async refresh(): Promise<void> {
    const response = await this.client.get(`/v2/datasets/${this.slug}`);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async update(options: DatasetUpdateOptions): Promise<void> {
    if (options.name) {
      this.validateDatasetName(options.name);
    }

    const response = await this.client.put(`/v2/datasets/${this.slug}`, options);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async delete(): Promise<void> {
    const response = await this.client.delete(`/v2/datasets/${this.slug}`);
    await this.handleResponse(response);
  }

  async publish(options: DatasetPublishOptions = {}): Promise<void> {
    const response = await this.client.post(`/v2/datasets/${this.slug}/publish`, options);
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async addColumn(column: ColumnDefinition): Promise<ColumnResponse> {
    if (!column.name || typeof column.name !== 'string') {
      throw new Error('Column name is required and must be a string');
    }

    const response = await this.client.post(`/v2/datasets/${this.slug}/columns`, column);
    return await this.handleResponse(response);
  }

  async getColumns(): Promise<ColumnResponse[]> {
    const response = await this.client.get(`/v2/datasets/${this.slug}/columns`);
    const data = await this.handleResponse(response);
    return data.columns || [];
  }

  async addRow(rowData: RowData): Promise<RowResponse> {
    if (!rowData || typeof rowData !== 'object') {
      throw new Error('Row data must be a valid object');
    }

    const response = await this.client.post(`/v2/datasets/${this.slug}/rows`, { data: rowData });
    return await this.handleResponse(response);
  }

  async addRows(rows: RowData[]): Promise<RowResponse[]> {
    if (!Array.isArray(rows)) {
      throw new Error('Rows must be an array');
    }

    const response = await this.client.post(`/v2/datasets/${this.slug}/rows`, { rows: rows.map(data => ({ data })) });
    const result = await this.handleResponse(response);
    return result.rows || [];
  }

  async getRows(limit: number = 100, offset: number = 0): Promise<RowResponse[]> {
    const response = await this.client.get(`/v2/datasets/${this.slug}/rows?limit=${limit}&offset=${offset}`);
    const data = await this.handleResponse(response);
    return data.rows || [];
  }

  async fromCSV(csvContent: string, options: CSVImportOptions = {}): Promise<void> {
    const { hasHeader = true, delimiter = ',' } = options;
    
    if (!csvContent || typeof csvContent !== 'string') {
      throw new Error('CSV content must be a valid string');
    }

    const rows = this.parseCSV(csvContent, delimiter, hasHeader);
    
    if (rows.length === 0) {
      throw new Error('No data found in CSV');
    }

    // Add rows in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await this.addRows(batch);
    }
  }

  async getStats(): Promise<DatasetStats> {
    const response = await this.client.get(`/v2/datasets/${this.slug}/stats`);
    return await this.handleResponse(response);
  }

  async getVersions(): Promise<DatasetVersionsResponse> {
    const response = await this.client.get(`/v2/datasets/${this.slug}/versions`);
    return await this.handleResponse(response);
  }

  async getVersion(version: string): Promise<DatasetVersion | null> {
    const versionsData = await this.getVersions();
    return versionsData.versions.find(v => v.version === version) || null;
  }

  private parseCSV(csvContent: string, delimiter: string, hasHeader: boolean): RowData[] {
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return [];
    }

    const headers: string[] = [];
    const startIndex = hasHeader ? 1 : 0;

    if (hasHeader) {
      headers.push(...this.parseCSVLine(lines[0], delimiter));
    } else {
      // Generate default headers if no header row
      const firstRow = this.parseCSVLine(lines[0], delimiter);
      for (let i = 0; i < firstRow.length; i++) {
        headers.push(`column_${i + 1}`);
      }
    }

    const rows: RowData[] = [];
    
    for (let i = startIndex; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      const rowData: RowData = {};
      
      for (let j = 0; j < Math.min(headers.length, values.length); j++) {
        const value = values[j].trim();
        rowData[headers[j]] = this.parseValue(value);
      }
      
      rows.push(rowData);
    }

    return rows;
  }

  private parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i - 1] === delimiter || inQuotes)) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result.map(value => value.replace(/^"|"$/g, ''));
  }

  private parseValue(value: string): string | number | boolean | null {
    if (value === '' || value.toLowerCase() === 'null') {
      return null;
    }
    
    if (value.toLowerCase() === 'true') {
      return true;
    }
    
    if (value.toLowerCase() === 'false') {
      return false;
    }
    
    const numValue = Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return numValue;
    }
    
    return value;
  }
}