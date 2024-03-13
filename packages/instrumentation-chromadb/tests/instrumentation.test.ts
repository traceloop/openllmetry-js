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

import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { ChromaDBInstrumentation } from "../src/instrumentation";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import * as chromadb_module from "chromadb";

import { Polly, setupMocha as setupPolly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

const memoryExporter = new InMemorySpanExporter();

Polly.register(FetchAdapter);
Polly.register(FSPersister);

describe.skip("Test Pinecone instrumentation", function () {
  const provider = new BasicTracerProvider();
  let instrumentation: ChromaDBInstrumentation;
  let contextManager: AsyncHooksContextManager;

  setupPolly({
    adapters: ["fetch"],
    persister: "fs",
    recordIfMissing: process.env.RECORD_MODE === "NEW",
  });

  before(async () => {
    if (process.env.RECORD_MODE !== "NEW") {
      process.env.PINECONE_API_KEY = "test";
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new ChromaDBInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument(chromadb_module);
  });

  beforeEach(async function () {
    const { server } = this.polly as Polly;
    server.any().on("beforePersist", (_req, recording) => {
      recording.request.headers = recording.request.headers.filter(
        ({ name }: { name: string }) => name !== "api-key",
      );
    });

    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    memoryExporter.reset();
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  after(() => null);
});
