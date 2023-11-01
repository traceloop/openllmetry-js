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
  const { promptRegistryEnabled, promptRegistryPollingInterval } = options;

  if (!promptRegistryEnabled) return;

  try {
    const prompts = await fetchPrompts(options);
    populateRegistry(prompts);
  } catch (err) {}

  setInterval(async () => {
    try {
      const prompts = await fetchPrompts(options);
      populateRegistry(prompts);
    } catch (err) {}
  }, promptRegistryPollingInterval! * 1000);
};
