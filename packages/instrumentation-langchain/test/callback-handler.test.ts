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
import { stub, resetHistory } from "sinon";
import itParam from "mocha-param";

import { trace, DiagConsoleLogger, SpanStatusCode } from "@opentelemetry/api";
import { SpanAttributes, TraceloopSpanKindValues } from "@traceloop/ai-semantic-conventions";

import { CallbackTrigger, TraceloopCallbackHandler } from "../src";

import { name, version } from "../package.json";

describe("Test TraceloopCallbackHandler", () => {

  const serialized = { lc: 42, type: undefined, id: [ "unit", "tests" ] };
  const runId = "run-uuid";
  const error = new Error("handcrafted error");

  const tracer = trace.getTracer(name, version);
  const stubSpan = tracer.startSpan("stubSpan");

  const startSpanStub = stub(tracer, "startSpan").returns(stubSpan);

  const endStub = stub(stubSpan, "end");
  const setAttributeStub = stub(stubSpan, "setAttribute");
  const setStatusStub = stub(stubSpan, "setStatus");
  const callbackHandler = new TraceloopCallbackHandler({ tracer, logger: new DiagConsoleLogger(), shouldSendPrompts: false });

  interface TestArguments {
    startFn: Function;
    startFnArgs: any[];
    endFn: Function;
    endFnArgs: any[];
    errorFn?: Function;
    errorFnArgs?: any[];
    spanKind: TraceloopSpanKindValues;
  }

  const TEST_ARGUMENTS_PER_CALLBACK_TRIGGER = {
    [CallbackTrigger.LLM]: {
      startFn: callbackHandler.handleLLMStart,
      startFnArgs: [ serialized, [ "first prompt", "second prompt" ], runId ],
      endFn: callbackHandler.handleLLMEnd,
      endFnArgs: [ [ [ { text: "output" } ] ], runId ],
      errorFn: callbackHandler.handleLLMError,
      errorFnArgs: [ error, runId ],
      spanKind: TraceloopSpanKindValues.TASK,
    },
    [CallbackTrigger.Chain]: {
      startFn: callbackHandler.handleChainStart,
      startFnArgs: [ serialized, { "key": "value" }, runId ],
      endFn: callbackHandler.handleChainEnd,
      endFnArgs: [ { "key": "value" }, runId ],
      errorFn: callbackHandler.handleChainError,
      errorFnArgs: [ error, runId ],
      spanKind: TraceloopSpanKindValues.WORKFLOW,
    },
    [CallbackTrigger.Tool]: {
      startFn: callbackHandler.handleToolStart,
      startFnArgs: [ serialized, "input", runId ],
      endFn: callbackHandler.handleToolEnd,
      endFnArgs: [ "output", runId ],
      errorFn: callbackHandler.handleToolError,
      errorFnArgs: [ error, runId ],
      spanKind: TraceloopSpanKindValues.TOOL,
    },
    [CallbackTrigger.Agent]: {
      startFn: callbackHandler.handleAgentAction,
      startFnArgs: [ { tool: "tool", toolInput: "toolInput", log: "log" }, runId ],
      endFn: callbackHandler.handleAgentEnd,
      endFnArgs: [ { returnValues: { "key": "value" } }, runId ],
      spanKind: TraceloopSpanKindValues.AGENT,
    },
    [CallbackTrigger.Retriever]: {
      startFn: callbackHandler.handleRetrieverStart,
      startFnArgs: [ serialized, "query", runId ],
      endFn: callbackHandler.handleRetrieverEnd,
      endFnArgs: [ [ { pageContent: "content", metadata: { "key": "value" } } ], runId ],
      errorFn: callbackHandler.handleRetrieverError,
      errorFnArgs: [ error, runId ],
      spanKind: TraceloopSpanKindValues.TASK,
    },
  };

  const TEST_ARGUMENTS_ARRAY = Object
    .values(CallbackTrigger)
    .filter(trigger => typeof trigger === "number")
    .map(trigger => trigger as CallbackTrigger)
    .map(trigger => TEST_ARGUMENTS_PER_CALLBACK_TRIGGER[trigger]);

  afterEach(() => {
    resetHistory();
  });

  itParam(
    "should handle spans correctly when handle start is called before handle end",
    TEST_ARGUMENTS_ARRAY,
    ({ startFn, startFnArgs, endFn, endFnArgs, spanKind }: TestArguments) => {
      startFn.call(callbackHandler, ...startFnArgs);
      assert.ok(startSpanStub.calledOnce);
      assert.ok(setAttributeStub.calledOnce);
      assert.deepStrictEqual(setAttributeStub.lastCall.firstArg, SpanAttributes.TRACELOOP_SPAN_KIND);
      assert.deepStrictEqual(setAttributeStub.lastCall.lastArg, spanKind);

      endFn.call(callbackHandler, ...endFnArgs);
      assert.ok(setStatusStub.calledOnce);
      assert.deepStrictEqual(setStatusStub.lastCall.firstArg, { code: SpanStatusCode.OK });
      assert.ok(endStub.calledOnce);
    }
  );

  itParam(
    "should handle spans correctly when there are processing errors",
    TEST_ARGUMENTS_ARRAY.filter(({ errorFn }: TestArguments) => !!errorFn),
    ({ startFn, startFnArgs, errorFn, errorFnArgs }: TestArguments) => {
      startFn.call(callbackHandler, ...startFnArgs);
      resetHistory();

      errorFn!.call(callbackHandler, ...errorFnArgs!);
      assert.ok(setStatusStub.calledOnce);
      assert.deepStrictEqual(setStatusStub.lastCall.firstArg["code"], SpanStatusCode.ERROR);
      assert.ok(endStub.calledOnce);
    }
  );

  it("should handle spans correctly on nested handle start and handle end calls", () => {
    const nestedCallAmount = 10;
    const { startFn, startFnArgs, endFn, endFnArgs, spanKind }: TestArguments = TEST_ARGUMENTS_PER_CALLBACK_TRIGGER[CallbackTrigger.Chain];

    [...Array(nestedCallAmount).keys()].forEach(_ => {
      startFn.call(callbackHandler, ...startFnArgs);
      assert.ok(startSpanStub.calledOnce);
      assert.ok(setAttributeStub.calledOnce);
      assert.deepStrictEqual(setAttributeStub.lastCall.firstArg, SpanAttributes.TRACELOOP_SPAN_KIND);
      assert.deepStrictEqual(setAttributeStub.lastCall.lastArg, spanKind);
      resetHistory();
    });

    [...Array(nestedCallAmount).keys()].forEach(_ => {
      endFn.call(callbackHandler, ...endFnArgs);
      assert.ok(setStatusStub.calledOnce);
      assert.deepStrictEqual(setStatusStub.lastCall.firstArg, { code: SpanStatusCode.OK });
      assert.ok(endStub.calledOnce);
      resetHistory();
    });

    assert.throws(() => endFn.call(callbackHandler, ...endFnArgs), Error);
  });

  it( "should send inputs and outputs when shouldSendPrompts is set", () => {
    const [ inputIndex, outputIndex ] = [ 1, 0 ];
    const handler = new TraceloopCallbackHandler({ tracer, logger: new DiagConsoleLogger(), shouldSendPrompts: true });
    const { startFnArgs, endFnArgs, spanKind }: TestArguments = TEST_ARGUMENTS_PER_CALLBACK_TRIGGER[CallbackTrigger.Tool];
    
    // funtion signature does not allow for spread operator :(
    handler.handleToolStart(startFnArgs[0], startFnArgs[1], startFnArgs[2]);
    assert.ok(startSpanStub.calledOnce);
    assert.ok(setAttributeStub.calledTwice);
    assert.deepStrictEqual(setAttributeStub.firstCall.firstArg, SpanAttributes.TRACELOOP_SPAN_KIND);
    assert.deepStrictEqual(setAttributeStub.firstCall.lastArg, spanKind);
    assert.deepStrictEqual(setAttributeStub.lastCall.firstArg, SpanAttributes.TRACELOOP_ENTITY_INPUT);
    assert.deepStrictEqual(setAttributeStub.lastCall.lastArg, startFnArgs[inputIndex]);
    resetHistory();

    // funtion signature does not allow for spread operator :(
    handler.handleToolEnd(endFnArgs[0], endFnArgs[1]);
    assert.ok(setStatusStub.calledOnce);
    assert.deepStrictEqual(setStatusStub.lastCall.firstArg, { code: SpanStatusCode.OK });
    assert.ok(setAttributeStub.calledOnce);
    assert.deepStrictEqual(setAttributeStub.firstCall.firstArg, SpanAttributes.TRACELOOP_ENTITY_OUTPUT);
    assert.deepStrictEqual(setAttributeStub.firstCall.lastArg, endFnArgs[outputIndex]);
    assert.ok(endStub.calledOnce);
  });

  itParam(
    "should throw if handle end is called before handle start",
    TEST_ARGUMENTS_ARRAY,
    ({ endFn, endFnArgs }: TestArguments) => {
      assert.throws(() => endFn.call(callbackHandler, ...endFnArgs), Error);
    }
  );

  itParam(
    "should throw if handle end is called twice after handle start",
    TEST_ARGUMENTS_ARRAY,
    ({ startFn, startFnArgs, endFn, endFnArgs }: TestArguments) => {
        startFn.call(callbackHandler, ...startFnArgs);
        endFn.call(callbackHandler, ...endFnArgs);
        assert.throws(() => endFn.call(callbackHandler, ...endFnArgs), Error);
    }
  );
});
