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

// TODO: Bump openai devDependency from 4.x to ^6 once we migrate the test
// HTTP mocking from Polly.js to msw (or undici MockAgent). OpenAI SDK v6 uses
// native fetch/undici which Polly's adapters cannot intercept in replay mode.
// See: openai-semconv-review.md and semantic-conventions-migration.md for context.

import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import * as traceloop from "../src";

export const sharedMemoryExporter = new InMemorySpanExporter();
let isInitialized = false;

export function initializeSharedTraceloop() {
  if (isInitialized) {
    return;
  }

  traceloop.initialize({
    appName: "test_shared",
    disableBatch: true,
    exporter: sharedMemoryExporter,
  });

  isInitialized = true;
}

export function getSharedExporter() {
  return sharedMemoryExporter;
}
