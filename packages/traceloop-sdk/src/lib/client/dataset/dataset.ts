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
  DatasetVersion,
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
    return this._data.createdAt || "";
  }

  get updatedAt(): string {
    return this._data.updatedAt || "";
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

    const response = await this.client.put(
      `/v2/datasets/${this.slug}`,
      options,
    );
    await this.handleResponse(response);

    // API returns empty response for updates, so always refresh to get updated data
    await this.refresh();
  }

  async delete(): Promise<void> {
    const response = await this.client.delete(`/v2/datasets/${this.slug}`);
    await this.handleResponse(response);
  }

  async publish(options: DatasetPublishOptions = {}): Promise<void> {
    const response = await this.client.post(
      `/v2/datasets/${this.slug}/publish`,
      options,
    );
    const data = await this.handleResponse(response);
    this._data = data;
  }

  async addColumn(column: ColumnDefinition): Promise<ColumnResponse> {
    if (!column.name || typeof column.name !== "string") {
      throw new Error("Column name is required and must be a string");
    }

    const response = await this.client.post(
      `/v2/datasets/${this.slug}/columns`,
      column,
    );
    const data = await this.handleResponse(response);

    // Check if the API returns the column directly
    if (data && data.column) {
      // According to PR #320, AddColumn returns a response with a column object
      const columnData = data.column;
      return {
        slug: columnData.slug,
        datasetId: this._data.id,
        datasetSlug: this._data.slug,
        name: columnData.name || column.name,
        type: columnData.type || column.type,
        required:
          columnData.required !== undefined
            ? columnData.required
            : column.required || false,
        description: columnData.description || column.description,
        createdAt: columnData.createdAt || new Date().toISOString(),
        updatedAt: columnData.updatedAt || new Date().toISOString(),
      };
    }

    // Fallback: Check if the API returns the column directly (older format)
    if (data && data.slug) {
      return {
        slug: data.slug,
        datasetId: this._data.id,
        datasetSlug: this._data.slug,
        name: data.name || column.name,
        type: data.type || column.type,
        required:
          data.required !== undefined
            ? data.required
            : column.required || false,
        description: data.description || column.description,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    }

    // API returns the full dataset, so we need to extract the new column
    // Update our internal data with the response
    this._data = data;

    // Find the newly created column (it will be in the columns object)
    const dataWithColumns = data as any;
    if (dataWithColumns.columns) {
      const columnEntries = Object.entries(dataWithColumns.columns);
      const newColumn = columnEntries.find(
        ([, col]: [string, any]) => col.name === column.name,
      );

      if (newColumn) {
        const [columnSlug, columnData] = newColumn;
        const col = columnData as any;
        return {
          slug: columnSlug, // Changed from id to slug
          datasetId: this._data.id,
          datasetSlug: this._data.slug,
          name: col.name,
          type: col.type,
          required:
            col.required !== undefined
              ? col.required
              : column.required || false,
          description: col.description,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        };
      }
    }

    throw new Error("Failed to create column or extract column from response");
  }

  async getColumns(): Promise<ColumnResponse[]> {
    // Refresh dataset to get latest column data
    await this.refresh();

    // Extract columns from the dataset's columns object
    const dataWithColumns = this._data as any;
    if (!dataWithColumns.columns) {
      return [];
    }

    const columns: ColumnResponse[] = [];
    for (const [columnSlug, columnData] of Object.entries(
      dataWithColumns.columns,
    )) {
      const col = columnData as any;
      columns.push({
        slug: columnSlug, // Changed from id to slug
        datasetId: this._data.id,
        datasetSlug: this._data.slug,
        name: col.name,
        type: col.type,
        required: col.required === true,
        description: col.description,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      });
    }

    return columns;
  }

  async addRow(rowData: RowData): Promise<RowResponse> {
    if (!rowData || typeof rowData !== "object") {
      throw new Error("Row data must be a valid object");
    }

    // Use the batch endpoint for single rows too
    const rows = await this.addRows([rowData]);
    if (rows.length === 0) {
      throw new Error("Failed to add row");
    }
    return rows[0];
  }

  async addRows(rows: RowData[]): Promise<RowResponse[]> {
    if (!Array.isArray(rows)) {
      throw new Error("Rows must be an array");
    }

    // Get column mappings
    const columns = await this.getColumns();
    const columnMap = new Map<string, string>();

    columns.forEach((col) => {
      columnMap.set(col.name, col.slug); // Changed from col.id to col.slug
    });

    // Transform rows to use column slugs instead of names
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

    // Transform the response back to the expected format
    if (result.rows) {
      return result.rows.map((row: any) => ({
        id: row.id,
        datasetId: this._data.id,
        datasetSlug: this._data.slug,
        data: this.transformValuesBackToNames(row.values, columnMap),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    }

    return [];
  }

  private transformValuesBackToNames(
    values: { [columnSlug: string]: any },
    columnMap: Map<string, string>,
  ): RowData {
    const result: RowData = {};

    // Create reverse mapping from slug to name
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

  async getRows(limit = 100, offset = 0): Promise<RowResponse[]> {
    const response = await this.client.get(
      `/v2/datasets/${this.slug}/rows?limit=${limit}&offset=${offset}`,
    );
    const data = await this.handleResponse(response);
    return data.rows || [];
  }

  async fromCSV(
    csvContent: string,
    options: CSVImportOptions = {},
  ): Promise<void> {
    const { hasHeader = true, delimiter = "," } = options;

    if (!csvContent || typeof csvContent !== "string") {
      throw new Error("CSV content must be a valid string");
    }

    const rows = this.parseCSV(csvContent, delimiter, hasHeader);

    if (rows.length === 0) {
      throw new Error("No data found in CSV");
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
    const response = await this.client.get(
      `/v2/datasets/${this.slug}/versions`,
    );
    return await this.handleResponse(response);
  }

  async getVersion(version: string): Promise<DatasetVersion | null> {
    const versionsData = await this.getVersions();
    return versionsData.versions.find((v) => v.version === version) || null;
  }

  private parseCSV(
    csvContent: string,
    delimiter: string,
    hasHeader: boolean,
  ): RowData[] {
    const lines = csvContent
      .split("\n")
      .filter((line) => line.trim().length > 0);

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
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] === delimiter || inQuotes)) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map((value) => value.replace(/^"|"$/g, ""));
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
