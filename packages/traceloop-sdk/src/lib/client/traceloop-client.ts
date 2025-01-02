import { Annotation } from "./annotation";
import { version } from "../../../package.json";

export class TraceloopClient {
  private version: string = version;
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

  async post(path: string, body: any) {
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
