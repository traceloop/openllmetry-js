import { InitializeOptions } from "../interfaces";
import fetch from "cross-fetch";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetchRetry = require("fetch-retry")(fetch);

export const fetchPrompts = async (options: InitializeOptions) => {
  const { apiKey, baseUrl, traceloopSyncMaxRetries } = options;

  const response = await fetchRetry(`${baseUrl}/v1/traceloop/prompts`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Traceloop-SDK-Version": "0.0.30",
    },
    retries: traceloopSyncMaxRetries,
    retryOn: function (attempt: any, error: any, response: any) {
      if (attempt >= traceloopSyncMaxRetries!) return false;
      if (response?.status && response.status >= 500) {
        return true;
      }
      return false;
    },
    retryDelay: function (attempt: any) {
      return Math.pow(2, attempt) * 1000; // 1000, 2000, 4000
    },
  });

  return await response.json();
};
