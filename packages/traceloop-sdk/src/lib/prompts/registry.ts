import { InitializeOptions, Prompt } from "../interfaces";
import { InitializationError, PromptNotFoundError } from "../errors";
import { fetchPrompts } from "./fetch";
import { diag } from "@opentelemetry/api";

const _prompts: Record<string, Prompt> = {};
let _initialized = false;
let _initializedPromise: Promise<boolean>;

/**
 * Returns true once SDK prompt registry has been initialized, else rejects with an error.
 * @returns Promise<boolean>
 */
export const waitForInitialization = async () => {
  if (_initialized) {
    return true;
  }
  return await _initializedPromise;
};

export const getPromptByKey = (key: string) => {
  if (!_prompts[key]) {
    throw new PromptNotFoundError(key);
  }
  return _prompts[key];
};

const populateRegistry = (prompts: unknown[]) => {
  prompts?.forEach((prompt: unknown) => {
    _prompts[(prompt as any).key] = prompt as any;
  });
};

export const initializeRegistry = (options: InitializeOptions) => {
  const {
    baseUrl,
    traceloopSyncEnabled,
    traceloopSyncPollingInterval,
    traceloopSyncDevPollingInterval,
  } = options;

  if (!traceloopSyncEnabled || !baseUrl?.includes("traceloop")) return;

  let pollingInterval = traceloopSyncPollingInterval;

  _initializedPromise = fetchPrompts(options)
    .then(({ prompts, environment }) => {
      if (environment === "dev") {
        pollingInterval = traceloopSyncDevPollingInterval;
      }
      populateRegistry(prompts);
      _initialized = true;

      setInterval(async () => {
        try {
          const { prompts } = await fetchPrompts(options);
          populateRegistry(prompts);
        } catch (err) {
          diag.error("Failed to fetch prompt data", err);
        }
      }, pollingInterval! * 1000).unref();

      return true;
    })
    .catch((e) => {
      throw new InitializationError(
        "Failed to fetch prompt data to initialize Traceloop SDK",
        e,
      );
    });
};
