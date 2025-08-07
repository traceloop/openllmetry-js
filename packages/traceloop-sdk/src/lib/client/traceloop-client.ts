import { TraceloopClientOptions } from "../interfaces";
import { version } from "../../../package.json";
import { UserFeedback } from "./annotation/user-feedback";
import { Datasets } from "./dataset/datasets";

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
  private projectId: string;

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
    this.projectId =
      options.projectId || process.env.TRACELOOP_PROJECT_ID || "default";
  }

  userFeedback = new UserFeedback(this);
  datasets = new Datasets(this);

  getProjectId(): string {
    return this.projectId;
  }

  buildDatasetPath(path: string): string {
    // Replace any path that starts with /v2/datasets with the correct project-based path
    if (path.startsWith("/v2/datasets")) {
      return path.replace(
        "/v2/datasets",
        `/v2/projects/${this.projectId}/datasets`,
      );
    }
    return path;
  }

  async post(path: string, body: Record<string, unknown> | any) {
    const finalPath = this.buildDatasetPath(path);
    return await fetch(`${this.baseUrl}${finalPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
      body: JSON.stringify(body),
    });
  }

  async get(path: string) {
    const finalPath = this.buildDatasetPath(path);
    return await fetch(`${this.baseUrl}${finalPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
    });
  }

  async put(path: string, body: Record<string, unknown> | any) {
    const finalPath = this.buildDatasetPath(path);
    return await fetch(`${this.baseUrl}${finalPath}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string) {
    const finalPath = this.buildDatasetPath(path);
    return await fetch(`${this.baseUrl}${finalPath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
    });
  }
}
