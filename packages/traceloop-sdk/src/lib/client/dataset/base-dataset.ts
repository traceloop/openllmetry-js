import { TraceloopClient } from "../traceloop-client";

export abstract class BaseDataset {
  constructor(protected client: TraceloopClient) {}

  protected async handleResponse(response: Response) {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If we can't parse the error response, use the default message
      }
      throw new Error(errorMessage);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return null;
  }

  protected validateDatasetId(id: string): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Dataset ID is required and must be a non-empty string');
    }
  }

  protected validateDatasetSlug(slug: string): void {
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      throw new Error('Dataset slug is required and must be a non-empty string');
    }
  }

  protected validateDatasetName(name: string): void {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Dataset name is required and must be a non-empty string');
    }
  }
}