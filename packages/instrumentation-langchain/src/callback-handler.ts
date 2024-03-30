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
import { Serialized } from "@langchain/core/load/serializable";
import { BaseCallbackHandler, BaseCallbackHandlerInput } from "@langchain/core/callbacks/base";
import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { ChainValues } from "@langchain/core/utils/types";
import { DiagLogger, Tracer, Span, SpanStatus, SpanStatusCode } from "@opentelemetry/api";
import { LLMResult } from "@langchain/core/outputs";
import { DocumentInterface } from "@langchain/core/documents";
import { SpanAttributes, TraceloopSpanKindValues } from "@traceloop/ai-semantic-conventions";

// exported for tests
export enum CallbackTrigger {
  LLM, Chain, Tool, Agent, Retriever
}

interface TraceloopCallbackHandlerInput extends BaseCallbackHandlerInput {
    tracer: Tracer;
    logger: DiagLogger;
    shouldSendPrompts: boolean;
}

export class TraceloopCallbackHandler extends BaseCallbackHandler {
  name = "TraceloopCallbackHandler";

  private readonly ID_SEPARATOR = '.';

  private readonly tracer: Tracer;
  private readonly logger: DiagLogger;
  private readonly shouldSendPrompts: boolean;
  private readonly activeSpans: Map<CallbackTrigger, Span[]>;

  constructor(input: TraceloopCallbackHandlerInput) {
    super(input);
    this.tracer = input.tracer;
    this.logger = input.logger;
    this.shouldSendPrompts = input.shouldSendPrompts;
    this.activeSpans = new Map<CallbackTrigger, Span[]>();

    this.logger.debug(`Built CallbackHandler, it will${this.shouldSendPrompts ? '' : ' not'} send prompts.`);
  }

  override handleLLMStart(llm: Serialized, prompts: string[], runId: string, parentRunId?: string, extraParams?: Record<string, unknown>, tags?: string[], metadata?: Record<string, unknown>, name?: string) {
    this.logger.debug(`Inside 'handleLLMStart': {llm: ${JSON.stringify(llm)}, prompts: ${prompts}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.pushSpan(CallbackTrigger.LLM, llm.id.join(this.ID_SEPARATOR), TraceloopSpanKindValues.TASK, JSON.stringify(prompts));
  }
  
  override handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleLLMEnd': {output: ${JSON.stringify(output)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.LLM, { code: SpanStatusCode.OK }, JSON.stringify(output));
  }

  override handleLLMError(err: any, runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleLLMError': {err: ${JSON.stringify(err)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.LLM, { code: SpanStatusCode.ERROR, message: JSON.stringify(err) });
  }
  
  override handleChainStart(chain: Serialized, inputs: ChainValues, runId: string, parentRunId?: string, tags?: string[], metadata?: Record<string, unknown>, runType?: string, name?: string) {
    this.logger.debug(`Inside 'handleChainStart': {chain: ${JSON.stringify(chain)}, inputs: ${JSON.stringify(inputs)}, runId: ${runId}, parentRunId: ${parentRunId}}`);
    
    this.pushSpan(CallbackTrigger.Chain, chain.id.join(this.ID_SEPARATOR), TraceloopSpanKindValues.WORKFLOW, JSON.stringify(inputs));
  }

  override handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string, tags?: string[], kwargs?: { inputs?: Record<string, unknown>; }) {
    this.logger.debug(`Inside 'handleChainEnd': {outputs: ${JSON.stringify(outputs)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Chain, { code: SpanStatusCode.OK }, JSON.stringify(outputs));
  }

  override handleChainError(err: any, runId: string, parentRunId?: string, tags?: string[], kwargs?: { inputs?: Record<string, unknown>; }) {
    this.logger.debug(`Inside 'handleChainError': {err: ${JSON.stringify(err)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Chain, { code: SpanStatusCode.ERROR, message: JSON.stringify(err) });
  }

  override handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string, tags?: string[], metadata?: Record<string, unknown>, name?: string) {
    this.logger.debug(`Inside 'handleToolStart': {tool: ${JSON.stringify(tool)}, input: ${JSON.stringify(input)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.pushSpan(CallbackTrigger.Tool, tool.id.join(this.ID_SEPARATOR), TraceloopSpanKindValues.TOOL, input);
  }

  override handleToolEnd(output: string, runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleToolEnd': {output: ${output}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Tool, { code: SpanStatusCode.OK }, output);
  }

  override handleToolError(err: any, runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleToolError': {err: ${JSON.stringify(err)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Tool, { code: SpanStatusCode.ERROR, message: JSON.stringify(err) });
  }

  override handleAgentAction(action: AgentAction, runId: string, parentRunId?: string, tags?: string[]): void | Promise<void> {
    this.logger.debug(`Inside 'handleAgentAction': {action: ${JSON.stringify(action)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.pushSpan(CallbackTrigger.Agent, action.tool, TraceloopSpanKindValues.AGENT, action.toolInput);
  }

  override handleAgentEnd(action: AgentFinish, runId: string, parentRunId?: string | undefined, tags?: string[] | undefined): void | Promise<void> {
    this.logger.debug(`Inside 'handleAgentEnd': {action: ${JSON.stringify(action)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Agent, { code: SpanStatusCode.OK }, JSON.stringify(action.returnValues));
  }

  override handleRetrieverStart(retriever: Serialized, query: string, runId: string, parentRunId?: string, tags?: string[], metadata?: Record<string, unknown>, name?: string) {
    this.logger.debug(`Inside 'handleRetrieverStart': {retriever: ${JSON.stringify(retriever)}, query: ${query}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.pushSpan(CallbackTrigger.Retriever, retriever.id.join(this.ID_SEPARATOR), TraceloopSpanKindValues.TASK, query);
  }
  
  override handleRetrieverEnd(documents: DocumentInterface<Record<string, any>>[], runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleRetrieverEnd': {documents: ${JSON.stringify(documents)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Retriever, { code: SpanStatusCode.OK }, JSON.stringify(documents));
  }

  override handleRetrieverError(err: any, runId: string, parentRunId?: string, tags?: string[]) {
    this.logger.debug(`Inside 'handleRetrieverError': {err: ${JSON.stringify(err)}, runId: ${runId}, parentRunId: ${parentRunId}}`);

    this.popSpan(CallbackTrigger.Retriever, { code: SpanStatusCode.ERROR, message: JSON.stringify(err) });
  }

  private pushSpan(trigger: CallbackTrigger, id: string, spanKind: TraceloopSpanKindValues, inputs?: string): void {
    const span = this.tracer.startSpan(id);
    span.setAttribute(SpanAttributes.TRACELOOP_SPAN_KIND, spanKind);

    if (this.shouldSendPrompts && !!inputs) {
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_INPUT, inputs);
    }

    if (!this.activeSpans.has(trigger)) {
      this.activeSpans.set(trigger, []);
    }

    this.activeSpans.get(trigger)!.push(span);
  }

  private popSpan(trigger: CallbackTrigger, status: SpanStatus, outputs?: string): void {
    if (!this.activeSpans.has(trigger) || this.activeSpans.get(trigger)!.length === 0) {
      const message = `Tried to pop span for CallbackTrigger.${CallbackTrigger[trigger]}, but there was none. Current active spans: ${JSON.stringify(this.activeSpans)}`;
      this.logger.error(message);
      throw new Error(message);
    }

    const span = this.activeSpans.get(trigger)!.pop()!;
    span.setStatus(status);

    if (this.shouldSendPrompts && !!outputs) {
      span.setAttribute(SpanAttributes.TRACELOOP_ENTITY_OUTPUT, outputs);
    }

    span.end();
  }
}
