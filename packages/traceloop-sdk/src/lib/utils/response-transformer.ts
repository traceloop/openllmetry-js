/**
 * Utility functions for transforming API responses from snake_case to camelCase
 */

/**
 * Converts a snake_case string to camelCase
 * @param str The snake_case string to convert
 * @returns The camelCase version of the string
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively transforms all snake_case keys in an object to camelCase
 * @param obj The object to transform
 * @returns A new object with camelCase keys
 */
export function transformResponseKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformResponseKeys);
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const transformed: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = transformResponseKeys(value);
    }

    return transformed;
  }

  return obj;
}

/**
 * Transforms API response data by converting snake_case keys to camelCase
 * This function is designed to be used in the BaseDataset.handleResponse() method
 * to ensure consistent camelCase format throughout the SDK
 *
 * @param data The raw API response data
 * @returns The transformed data with camelCase keys
 */
export function transformApiResponse<T = any>(data: any): T {
  return transformResponseKeys(data) as T;
}
