import { TraceloopClientOptions } from "../interfaces";
import { version } from "../../../package.json";
import { UserFeedback } from "./annotation/user-feedback";
import { Datasets } from "./dataset/datasets";
import { Experiment } from "./experiment/experiment";
import { Evaluator } from "./evaluator/evaluator";

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
  public experimentSlug?: string;

  public userFeedback: UserFeedback;
  public datasets: Datasets;
  public experiment: Experiment;
  public evaluator: Evaluator;

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
    this.experimentSlug = options.experimentSlug;

    this.userFeedback = new UserFeedback(this);
    this.datasets = new Datasets(this);
    this.experiment = new Experiment(this);
    this.evaluator = new Evaluator(this);
  }

  async post(path: string, body: Record<string, unknown> | any) {
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

  async get(path: string) {
    return await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
    });
  }

  async put(path: string, body: Record<string, unknown> | any) {
    return await fetch(`${this.baseUrl}${path}`, {
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
    return await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Traceloop-SDK-Version": this.version,
      },
    });
  }
}
