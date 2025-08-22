import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "./base-dataset";
import { Row } from "./row";
import { Column } from "./column";
import * as Papa from "papaparse";
import {
  DatasetResponse,
  DatasetUpdateOptions,
  ColumnDefinition,
  RowData,
  DatasetPublishOptions,
  CSVImportOptions,
  ColumnResponse,
  RowResponse,
  DatasetVersionsResponse,
  DatasetVersion,
} from "../../interfaces";

export class Dataset extends BaseDatasetEntity {
  private _data: DatasetResponse;
  private _deleted = false;

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

  get version(): string | undefined {
    return this._data.version;
  }

  get published(): boolean {
    return this._data.published || false;
  }

  get createdAt(): string {
    return this._data.createdAt || "";
  }

  get updatedAt(): string {
    return this._data.updatedAt || "";
  }

  get deleted(): boolean {
    return this._deleted;
  }

  async update(options: DatasetUpdateOptions): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot update a deleted dataset");
    }

    if (options.name) {
      this.validateDatasetName(options.name);
    }

    const response = await this.client.put(
      `/v2/datasets/${this.slug}`,
      options,
    );
    await this.handleResponse(response);
  }

  async delete(): Promise<void> {
    if (this._deleted) {
      throw new Error("Dataset is already deleted");
    }

    const response = await this.client.delete(`/v2/datasets/${this.slug}`);
    await this.handleResponse(response);
    this._deleted = true;
  }

  async publish(options: DatasetPublishOptions = {}): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot publish a deleted dataset");
    }

    const response = await this.client.post(
      `/v2/datasets/${this.slug}/publish`,
      options,
    );
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async addColumn(columns: ColumnDefinition[]): Promise<Column[]> {
    if (this._deleted) {
      throw new Error("Cannot add columns to a deleted dataset");
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error("Columns must be a non-empty array");
    }

    const results: Column[] = [];

    for (const column of columns) {
      if (!column.name || typeof column.name !== "string") {
        throw new Error("Column name is required and must be a string");
      }

      const response = await this.client.post(
        `/v2/datasets/${this.slug}/columns`,
        column,
      );
      const data = await this.handleResponse(response);

      if (!data || !data.slug) {
        throw new Error("Failed to create column: Invalid API response");
      }

      const columnResponse: ColumnResponse = {
        slug: data.slug,
        datasetId: this._data.id,
        datasetSlug: this.slug,
        name: data.name,
        type: data.type,
        required: data.required,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };

      results.push(new Column(this.client, columnResponse));
    }

    return results;
  }

  async getColumns(): Promise<Column[]> {
    if (this._deleted) {
      throw new Error("Cannot get columns from a deleted dataset");
    }

    if (!this._data.columns) {
      return [];
    }

    const columns: Column[] = [];
    for (const [columnSlug, columnData] of Object.entries(this._data.columns)) {
      const col = columnData as any;
      const columnResponse: ColumnResponse = {
        slug: columnSlug,
        datasetId: this._data.id,
        datasetSlug: this.slug,
        name: col.name,
        type: col.type,
        required: col.required === true,
        description: col.description,
        createdAt: this._data.createdAt || this.createdAt,
        updatedAt: this._data.updatedAt || this.updatedAt,
      };
      columns.push(new Column(this.client, columnResponse));
    }

    return columns;
  }

  async addRow(rowData: RowData): Promise<Row> {
    if (this._deleted) {
      throw new Error("Cannot add row to a deleted dataset");
    }

    if (!rowData || typeof rowData !== "object") {
      throw new Error("Row data must be a valid object");
    }

    const rows = await this.addRows([rowData]);
    if (rows.length === 0) {
      throw new Error("Failed to add row");
    }
    return rows[0];
  }

  async addRows(rows: RowData[]): Promise<Row[]> {
    if (this._deleted) {
      throw new Error("Cannot add rows to a deleted dataset");
    }

    if (!Array.isArray(rows)) {
      throw new Error("Rows must be an array");
    }

    const columns = await this.getColumns();
    const columnMap = new Map<string, string>();

    columns.forEach((col) => {
      columnMap.set(col.name, col.slug);
    });
    const transformedRows = rows.map((row) => {
      const transformedRow: { [key: string]: any } = {};
      Object.keys(row).forEach((columnName) => {
        const columnSlug = columnMap.get(columnName);
        if (columnSlug) {
          transformedRow[columnSlug] = row[columnName];
        }
      });
      return transformedRow;
    });

    const payload = {
      Rows: transformedRows,
    };

    const response = await this.client.post(
      `/v2/datasets/${this.slug}/rows`,
      payload,
    );
    const result = await this.handleResponse(response);

    if (result.rows) {
      return result.rows.map((row: any) => {
        const rowResponse: RowResponse = {
          id: row.id,
          datasetId: this._data.id,
          datasetSlug: this.slug,
          data: this.transformValuesBackToNames(row.values, columnMap),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        return new Row(this.client, rowResponse);
      });
    }

    return [];
  }

  private transformValuesBackToNames(
    values: { [columnSlug: string]: any },
    columnMap: Map<string, string>,
  ): RowData {
    const result: RowData = {};

    const reverseMap = new Map<string, string>();
    columnMap.forEach((slug, name) => {
      reverseMap.set(slug, name);
    });

    Object.keys(values).forEach((columnSlug) => {
      const columnName = reverseMap.get(columnSlug);
      if (columnName) {
        result[columnName] = values[columnSlug];
      }
    });

    return result;
  }

  async getRows(limit = 100, offset = 0): Promise<Row[]> {
    if (this._deleted) {
      throw new Error("Cannot get rows from a deleted dataset");
    }

    const response = await this.client.get(
      `/v2/datasets/${this.slug}/rows?limit=${limit}&offset=${offset}`,
    );
    const data = await this.handleResponse(response);

    const rows = data.rows || [];
    return rows.map((row: any) => {
      const rowResponse: RowResponse = {
        id: row.id,
        datasetId: this._data.id,
        datasetSlug: this.slug,
        data: row.values || row.data || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return new Row(this.client, rowResponse);
    });
  }

  async fromCSV(
    csvContent: string,
    options: CSVImportOptions = {},
  ): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot import CSV to a deleted dataset");
    }

    const { hasHeader = true, delimiter = "," } = options;

    if (!csvContent || typeof csvContent !== "string") {
      throw new Error("CSV content must be a valid string");
    }

    const rows = this.parseCSV(csvContent, delimiter, hasHeader);

    if (rows.length === 0) {
      throw new Error("No data found in CSV");
    }

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await this.addRows(batch);
    }
  }

  async getVersions(): Promise<DatasetVersionsResponse> {
    if (this._deleted) {
      throw new Error("Cannot get versions of a deleted dataset");
    }

    const response = await this.client.get(
      `/v2/datasets/${this.slug}/versions`,
    );
    return await this.handleResponse(response);
  }

  async getVersion(version: string): Promise<DatasetVersion | null> {
    if (this._deleted) {
      throw new Error("Cannot get version of a deleted dataset");
    }

    const versionsData = await this.getVersions();
    return versionsData.versions.find((v) => v.version === version) || null;
  }

  async getVersionAsJsonl(version?: string): Promise<string> {
    if (this._deleted) {
      throw new Error("Cannot get JSONL data from a deleted dataset");
    }

    let url = `/v2/datasets/${this.slug}/jsonl`;
    if (version) {
      url += `?version=${encodeURIComponent(version)}`;
    }

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

  parseJsonlData(jsonlContent: string): Record<string, any>[] {
    if (!jsonlContent || jsonlContent.trim() === '') {
      return [];
    }

    const lines = jsonlContent.trim().split('\n');
    const results: Record<string, any>[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (line === '') {
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        
        // Only add non-null objects
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results.push(parsed);
        }
      } catch (error) {
        // Log parsing errors but continue processing
        console.warn(`Skipping invalid JSON line ${i + 1}: ${line}`, error);
      }
    }

    return results;
  }

  private parseCSV(
    csvContent: string,
    delimiter: string,
    hasHeader: boolean,
  ): RowData[] {
    const parseResult = Papa.parse(csvContent, {
      delimiter,
      header: hasHeader,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => this.parseValue(value.trim()),
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing failed: ${parseResult.errors[0].message}`);
    }

    return parseResult.data as RowData[];
  }

  private parseValue(value: string): string | number | boolean | null {
    if (value === "" || value.toLowerCase() === "null") {
      return null;
    }

    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }

    const numValue = Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return numValue;
    }

    return value;
  }
}
