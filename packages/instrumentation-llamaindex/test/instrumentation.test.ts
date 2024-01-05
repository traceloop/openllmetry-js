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

import { context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { LlamaIndexInstrumentation } from '../src/instrumentation';
import * as assert from 'assert';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type * as llamaindexImport from 'llamaindex';

const memoryExporter = new InMemorySpanExporter();

describe('Test LlamaIndex instrumentation', () => {
  const provider = new BasicTracerProvider();
  let instrumentation: LlamaIndexInstrumentation;
  let contextManager: AsyncHooksContextManager;
  let llamaindex: typeof llamaindexImport;

  beforeEach(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation = new LlamaIndexInstrumentation();
    instrumentation.setTracerProvider(provider);
    llamaindex = require('llamaindex');
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it('should set attributes in span', async () => {
    const openai = new llamaindex.OpenAI({ model: "gpt-3.5-turbo", temperature: 0 });
    await openai.complete("What's your name?");
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0].attributes['llm.request.type'], 'chat');
    assert.strictEqual(spans[1].attributes['llm.request.type'], 'complete');
  });
});
