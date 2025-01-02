import { Annotation } from "./annotation";
import { version } from "../../../package.json";

/**
 * The main client for interacting with Traceloop's API.
 * This client can be used either directly or through the singleton pattern via configuration.
 *
 * @example
 * // Direct usage
 * const client = new TraceloopClient('your-api-key');
 *
 * @example
 * // Through configuration (recommended)
 * initialize({ apiKey: 'your-api-key', appName: 'your-app' });
 * const client = getClient();
 */
export class TraceloopClient {
  private version: string = version;

  /**
   * Creates a new instance of the TraceloopClient.
   *
   * @param apiKey - The API key for authentication with Traceloop services
   * @param baseUrl - Optional custom base URL for the Traceloop API. Defaults to https://api.traceloop.com
   */
  constructor(
    private apiKey: string,
    private baseUrl?: string,
  ) {
    if (!baseUrl) {
      this.baseUrl =
        process.env.TRACELOOP_BASE_URL || "https://api.traceloop.com";
    }
  }
  annotation = new Annotation(this);

  async post(path: string, body: Record<string, unknown>) {
    return await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
      body: JSON.stringify(body),
    });
  }
}
