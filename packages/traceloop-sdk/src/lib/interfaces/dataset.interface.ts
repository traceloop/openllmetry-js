export interface DatasetCreateOptions {
  name: string;
  slug?: string;
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
  version?: string;
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
  columns?: Record<string, any>;
  rows?: RowResponse[];
}

export interface ColumnDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  slug?: string;
  required?: boolean;
  description?: string;
}

export interface ColumnResponse extends ColumnDefinition {
  slug: string;
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
  [key: string]: string | number | boolean | null;
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

export type DatasetColumnValue = string | number | boolean | null | undefined;
