import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuid } from "uuid";
import { PostHog } from "posthog-node";
import { version } from "../../../package.json";

export class Telemetry {
  private static instance: Telemetry;

  private static readonly ANON_ID_PATH = `${os.homedir()}/.cache/traceloop/telemetry_anon_id`;
  private static readonly UNKNOWN_ANON_ID = "UNKNOWN";

  private telemetryEnabled: boolean;
  private posthog: PostHog | undefined;
  private anonId: string | undefined;

  public static getInstance(): Telemetry {
    if (!Telemetry.instance) {
      Telemetry.instance = new Telemetry();
    }
    return Telemetry.instance;
  }

  private constructor() {
    this.telemetryEnabled =
      !process.env.TRACELOOP_TELEMETRY ||
      process.env.TRACELOOP_TELEMETRY.toLowerCase() === "true";

    if (this.telemetryEnabled) {
      this.posthog = new PostHog(
        "phc_JMTeAfG8OpaPsyHzSBtqquMvko1fmOHcW0gyqLCrF3t",
      );
    }
  }

  private getAnonId() {
    if (this.anonId) {
      return this.anonId;
    }

    try {
      if (!fs.existsSync(Telemetry.ANON_ID_PATH)) {
        fs.mkdirSync(path.dirname(Telemetry.ANON_ID_PATH), { recursive: true });
        const anonIdFile = fs.openSync(Telemetry.ANON_ID_PATH, "w");
        this.anonId = uuid();
        fs.writeSync(anonIdFile, this.anonId);
        fs.closeSync(anonIdFile);
      } else {
        const anonIdFile = fs.openSync(Telemetry.ANON_ID_PATH, "r");
        this.anonId = fs.readFileSync(anonIdFile, "utf8");
        fs.closeSync(anonIdFile);
      }
      return this.anonId;
    } catch (e) {
      return Telemetry.UNKNOWN_ANON_ID;
    }
  }

  private getContext() {
    return {
      sdk: "typescript",
      sdk_version: version,
    };
  }

  public capture(event: string, properties?: Record<string, string>) {
    if (this.telemetryEnabled && this.posthog) {
      this.posthog.capture({
        distinctId: this.getAnonId(),
        event,
        properties: {
          ...properties,
          ...this.getContext(),
        },
      });
      this.posthog.flush();
    }
  }

  public logException(error: Error) {
    if (this.telemetryEnabled) {
      this.capture("error", { error: error.message, stack: error.stack || "" });
    }
  }
}
