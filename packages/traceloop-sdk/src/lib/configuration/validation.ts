import { InitializeOptions } from "../interfaces";
import { InitializationError } from "../errors";

export const validateConfiguration = (options: InitializeOptions): void => {
  const { apiKey } = options;
  if (!apiKey) {
    throw new InitializationError('"apiKey" is required');
  }

  if (typeof apiKey !== "string") {
    throw new InitializationError('"apiKey" must be a string');
  }
};
