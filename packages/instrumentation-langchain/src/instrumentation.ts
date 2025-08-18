/*
 * Copyright Traceloop
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { context } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
} from "@opentelemetry/instrumentation";
import { CONTEXT_KEY_ALLOW_TRACE_CONTENT } from "@traceloop/ai-semantic-conventions";
import { LangChainInstrumentationConfig } from "./types";
import { TraceloopCallbackHandler } from "./callback_handler";
import { version } from "../package.json";

export class LangChainInstrumentation extends InstrumentationBase {
  declare protected _config: LangChainInstrumentationConfig;

  constructor(config: LangChainInstrumentationConfig = {}) {
    super("@traceloop/instrumentation-langchain", version, config);

    // Manually instrument CallbackManager immediately since module detection doesn't work
    this.instrumentCallbackManagerDirectly();
  }

  public manuallyInstrument({
    callbackManagerModule,
  }: {
    callbackManagerModule?: any;
  }) {
    if (callbackManagerModule) {
      this._diag.debug(
        "Manually instrumenting @langchain/core/callbacks/manager",
      );
      this.patchCallbackManager(callbackManagerModule.CallbackManager);
    }
  }

  protected init(): InstrumentationModuleDefinition<any>[] {
    // Return empty array since we handle patching in constructor
    return [];
  }

  private instrumentCallbackManagerDirectly() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const callbackManagerModule = require("@langchain/core/callbacks/manager");

      if (callbackManagerModule?.CallbackManager) {
        this.patchCallbackManager(callbackManagerModule.CallbackManager);
      }
    } catch (error) {
      this._diag.debug("Error instrumenting callback manager:", error);
    }
  }

  private patchCallbackManager(CallbackManager: unknown) {
    const callbackManagerAny = CallbackManager as Record<string, unknown>;

    if (
      callbackManagerAny._configureSync &&
      !callbackManagerAny._traceloopPatched
    ) {
      const originalConfigureSync = callbackManagerAny._configureSync;

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      callbackManagerAny._configureSync = function (
        inheritableHandlers?: unknown[],
        localHandlers?: unknown[],
        inheritableTags?: string[],
        localTags?: string[],
        inheritableMetadata?: Record<string, unknown>,
        localMetadata?: Record<string, unknown>,
      ) {
        // Add our callback handler to inheritable handlers
        const callbackHandler = new TraceloopCallbackHandler(
          self.tracer,
          self._shouldSendPrompts(),
        );
        const updatedInheritableHandlers =
          inheritableHandlers && Array.isArray(inheritableHandlers)
            ? [...inheritableHandlers, callbackHandler]
            : [callbackHandler];

        return (originalConfigureSync as (...args: unknown[]) => unknown).call(
          this,
          updatedInheritableHandlers,
          localHandlers,
          inheritableTags,
          localTags,
          inheritableMetadata,
          localMetadata,
        );
      };

      // Mark as patched to avoid double patching
      callbackManagerAny._traceloopPatched = true;
    }
  }

  private _shouldSendPrompts() {
    const contextShouldSendPrompts = context
      .active()
      .getValue(CONTEXT_KEY_ALLOW_TRACE_CONTENT);

    if (contextShouldSendPrompts !== undefined) {
      return !!contextShouldSendPrompts;
    }

    return this._config.traceContent !== undefined
      ? this._config.traceContent
      : true;
  }
}
