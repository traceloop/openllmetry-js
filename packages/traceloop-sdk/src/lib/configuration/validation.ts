import { InitializeOptions } from "../interfaces";
import { InitializationError } from "../errors";

export const validateConfiguration = (options: InitializeOptions): void => {
  const {
    apiKey,
    promptRegistryEnabled,
    promptRegistryMaxRetries,
    promptRegistryPollingInterval,
  } = options;
  if (!apiKey) {
    throw new InitializationError('"apiKey" is required');
  }

  if (typeof apiKey !== "string") {
    throw new InitializationError('"apiKey" must be a string');
  }

  if (promptRegistryEnabled) {
    if (
      typeof promptRegistryMaxRetries !== "number" ||
      promptRegistryMaxRetries <= 0
    ) {
      throw new InitializationError(
        '"promptRegistryMaxRetries" must be an integer greater than 0.',
      );
    }

    if (
      typeof promptRegistryPollingInterval !== "number" ||
      promptRegistryPollingInterval <= 0
    ) {
      throw new InitializationError(
        '"promptRegistryPollingInterval" must be an integer greater than 0.',
      );
    }
  }
};
