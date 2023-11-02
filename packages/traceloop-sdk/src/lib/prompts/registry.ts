import { InitializeOptions, Prompt } from "../interfaces";
import { _configuration } from "../configuration";
import { PromptNotFoundError } from "../errors";
import { fetchPrompts } from "./fetch";

const _prompts: Record<string, Prompt> = {};

export const getPromptByKey = (key: string) => {
  if (!_prompts[key]) {
    throw new PromptNotFoundError(key);
  }
  return _prompts[key];
};

const populateRegistry = (prompts: any) => {
  prompts.forEach((prompt: any) => {
    _prompts[prompt.key] = prompt;
  });
};

export const initializeRegistry = async (options: InitializeOptions) => {
  const { traceloopSyncEnabled, traceloopSyncPollingInterval, traceloopSyncDevPollingInterval } = options;

  if (!traceloopSyncEnabled) return;

  let pollingInterval = traceloopSyncPollingInterval;
  try {
    const { prompts, environment } = await fetchPrompts(options);
    if (environment === "dev") {
        pollingInterval = traceloopSyncDevPollingInterval;
    }
    populateRegistry(prompts);
  } catch (err) {}

  setInterval(async () => {
    try {
      const { prompts } = await fetchPrompts(options);
      populateRegistry(prompts);
    } catch (err) {}
  }, pollingInterval! * 1000);
};
