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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from "assert";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { LangChainInstrumentation } from "../src/instrumentation";

interface FakeHandler {
  name: string;
}

// Minimal stand-in for LangChain's `CallbackManager`: patchCallbackManager
// only ever reads `_configureSync` and `inheritableHandlers` off it.
class FakeCallbackManager {
  inheritableHandlers: FakeHandler[];

  constructor(inheritableHandlers: FakeHandler[] = []) {
    this.inheritableHandlers = inheritableHandlers;
  }

  static _configureSync(
    inheritableHandlers?: unknown,
    localHandlers?: unknown[],
  ) {
    return { inheritableHandlers, localHandlers };
  }
}

describe("_configureSync patch preserves and de-duplicates handlers", () => {
  let instrumentation: LangChainInstrumentation;

  beforeEach(() => {
    const provider = new NodeTracerProvider();
    instrumentation = new LangChainInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument({
      callbackManagerModule: { CallbackManager: FakeCallbackManager },
    });
  });

  it("preserves and de-duplicates handlers passed as an array", () => {
    const sentinel: FakeHandler = { name: "sentinel_handler" };
    const existingTraceloopHandler: FakeHandler = {
      name: "traceloop_callback_handler",
    };

    const result = FakeCallbackManager._configureSync([
      sentinel,
      existingTraceloopHandler,
    ]) as { inheritableHandlers: FakeHandler[] };

    const names = result.inheritableHandlers.map((h) => h.name);
    assert.ok(names.includes("sentinel_handler"));
    assert.strictEqual(
      names.filter((name) => name === "traceloop_callback_handler").length,
      1,
      "expected exactly one traceloop_callback_handler",
    );
  });

  it("preserves handlers when inheritableHandlers is a CallbackManager instance", () => {
    const sentinel: FakeHandler = { name: "sentinel_handler" };
    const existingTraceloopHandler: FakeHandler = {
      name: "traceloop_callback_handler",
    };
    const parentManager = new FakeCallbackManager([
      sentinel,
      existingTraceloopHandler,
    ]);

    const result = FakeCallbackManager._configureSync(parentManager) as {
      inheritableHandlers: FakeHandler[];
    };

    const names = result.inheritableHandlers.map((h) => h.name);
    assert.ok(
      names.includes("sentinel_handler"),
      "sentinel handler inherited from the parent CallbackManager should be preserved",
    );
    assert.strictEqual(
      names.filter((name) => name === "traceloop_callback_handler").length,
      1,
      "expected exactly one traceloop_callback_handler, not a duplicate",
    );
  });
});
