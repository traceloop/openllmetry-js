export interface DatasetCreateOptions {
  name: string;
  description?: string;
}

export interface DatasetUpdateOptions {
  name?: string;
  description?: string;
}

export interface DatasetResponse {
  id: string;
  slug: string;
  name: string;
  description?: string;
  version?: number;
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string; // API sometimes returns snake_case
  updated_at?: string; // API sometimes returns snake_case
  columns?: Record<string, any>; // API returns columns as object
  rows?: any[]; // API returns rows array
}

export interface ColumnDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  required?: boolean;
  description?: string;
}

export interface ColumnResponse extends ColumnDefinition {
  id: string;
  datasetId: string;
  datasetSlug: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnUpdateOptions {
  name?: string;
  type?: "string" | "number" | "boolean" | "date";
  required?: boolean;
  description?: string;
}

export interface RowData {
  [key: string]: string | number | boolean | Date | null;
}

export interface RowResponse {
  id: string;
  datasetId: string;
  datasetSlug: string;
  data: RowData;
  createdAt: string;
  updatedAt: string;
}

export interface RowUpdateOptions {
  data: Partial<RowData>;
}

export interface DatasetListResponse {
  datasets: DatasetResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface DatasetPublishOptions {
  version?: string;
  description?: string;
}

export interface CSVImportOptions {
  hasHeader?: boolean;
  delimiter?: string;
  encoding?: string;
}

export interface DatasetStats {
  rowCount: number;
  columnCount: number;
  size: number;
  lastModified: string;
}

export interface DatasetVersion {
  version: string;
  publishedBy: string;
  publishedAt: string;
}

export interface DatasetVersionsResponse {
  datasetId: string;
  datasetSlug: string;
  versions: DatasetVersion[];
  total: number;
}
