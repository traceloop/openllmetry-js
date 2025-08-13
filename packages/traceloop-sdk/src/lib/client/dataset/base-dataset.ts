import { TraceloopClient } from "../traceloop-client";
import { transformApiResponse } from "../../utils/response-transformer";

export abstract class BaseDatasetEntity {
  constructor(protected client: TraceloopClient) {}

  protected async handleResponse(response: Response) {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default HTTP error message if JSON parsing fails
      }

      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const rawData = await response.json();
      return transformApiResponse(rawData);
    }

    // Handle non-JSON responses (text/csv, etc.)
    const textContent = await response.text();
    return {
      contentType: contentType || "text/plain",
      body: textContent,
    };
  }

  protected validateDatasetId(id: string): void {
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      throw new Error("Dataset ID is required and must be a non-empty string");
    }
  }

  protected validateDatasetSlug(slug: string): void {
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      throw new Error(
        "Dataset slug is required and must be a non-empty string",
      );
    }
  }

  protected validateDatasetName(name: string): void {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new Error(
        "Dataset name is required and must be a non-empty string",
      );
    }
  }
}
