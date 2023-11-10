import { InitializeOptions } from "../interfaces";
import { InitializationError } from "../errors";

export const validateConfiguration = (options: InitializeOptions): void => {
  const {
    apiKey,
    traceloopSyncEnabled,
    traceloopSyncMaxRetries,
    traceloopSyncPollingInterval,
    traceloopSyncDevPollingInterval,
  } = options;
  if (apiKey && typeof apiKey !== "string") {
    throw new InitializationError('"apiKey" must be a string');
  }

  if (traceloopSyncEnabled) {
    if (
      typeof traceloopSyncMaxRetries !== "number" ||
      traceloopSyncMaxRetries <= 0
    ) {
      throw new InitializationError(
        '"traceloopSyncMaxRetries" must be an integer greater than 0.',
      );
    }

    if (
      typeof traceloopSyncPollingInterval !== "number" ||
      traceloopSyncPollingInterval <= 0
    ) {
      throw new InitializationError(
        '"traceloopSyncPollingInterval" must be an integer greater than 0.',
      );
    }

    if (
      typeof traceloopSyncDevPollingInterval !== "number" ||
      traceloopSyncDevPollingInterval <= 0
    ) {
      throw new InitializationError(
        '"traceloopSyncDevPollingInterval" must be an integer greater than 0.',
      );
    }
  }
};
