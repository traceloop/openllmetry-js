import { TraceloopClientOptions } from "../interfaces";
import { version } from "../../../package.json";
import { UserFeedback } from "./annotation/user-feedback";

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
  public appName: string;
  private baseUrl: string;
  private apiKey: string;

  /**
   * Creates a new instance of the TraceloopClient.
   *
   * @param options - Configuration options for the client
   */
  constructor(options: TraceloopClientOptions) {
    this.apiKey = options.apiKey;
    this.appName = options.appName;
    this.baseUrl =
      options.baseUrl ||
      process.env.TRACELOOP_BASE_URL ||
      "https://api.traceloop.com";
  }

  userFeedback = new UserFeedback(this);

  async post(path: string, body: Record<string, unknown>) {
    return await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
      body: JSON.stringify(body),
    });
  }
}
