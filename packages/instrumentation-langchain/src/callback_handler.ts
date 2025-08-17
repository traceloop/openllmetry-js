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

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { BaseMessage } from "@langchain/core/messages";
import { LLMResult } from "@langchain/core/outputs";
import { Serialized } from "@langchain/core/load/serializable";
import { ChainValues } from "@langchain/core/utils/types";
import { Tracer, trace, SpanKind, SpanStatusCode, context } from "@opentelemetry/api";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

interface SpanData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  span: any;
  runId: string;
}

 
export class TraceloopCallbackHandler extends BaseCallbackHandler {
  name = "traceloop_callback_handler";
  
  private tracer: Tracer;
  private spans: Map<string, SpanData> = new Map();
  private traceContent: boolean;

  constructor(tracer: Tracer, traceContent = true) {
    super();
    this.tracer = tracer;
    this.traceContent = traceContent;
  }

  override async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const className = llm.id?.[llm.id.length - 1] || "unknown";
    const modelName = this.extractModelName(llm);
    const vendor = this.detectVendor(llm);
    const spanBaseName = this.convertClassNameToSpanName(className);
    
    // Create both a task span and an LLM span like Python implementation  
    const taskSpanName = `${spanBaseName}.task`;
    const taskSpan = this.tracer.startSpan(taskSpanName, {
      kind: SpanKind.CLIENT,
    });

    taskSpan.setAttributes({
      "traceloop.span.kind": "task",
      "traceloop.workflow.name": runName || taskSpanName,
    });

    if (this.traceContent) {
      const flatMessages = messages.flat();
      taskSpan.setAttributes({
        "traceloop.entity.input": JSON.stringify(flatMessages.map(m => ({ 
          role: m._getType(), 
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }))),
      });
    }

    // Create LLM span as child of task span
    const llmSpan = this.tracer.startSpan(`${spanBaseName}.completion`, {
      kind: SpanKind.CLIENT,
    }, trace.setSpan(context.active(), taskSpan));

    const flatMessages = messages.flat();
    llmSpan.setAttributes({
      [SpanAttributes.LLM_SYSTEM]: vendor,
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
      [SpanAttributes.LLM_REQUEST_MODEL]: modelName,
    });

    // Add prompts if tracing content
    if (this.traceContent && flatMessages.length > 0) {
      flatMessages.forEach((message, idx) => {
        const role = this.mapMessageTypeToRole(message._getType());
        llmSpan.setAttributes({
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.role`]: role,
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.content`]: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        });
      });
    }

    this.spans.set(runId, { span: taskSpan, runId });
    this.spans.set(`${runId}_llm`, { span: llmSpan, runId: `${runId}_llm` });
  }

  override async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string
  ): Promise<void> {
    const className = llm.id?.[llm.id.length - 1] || "unknown";
    const modelName = this.extractModelName(llm);
    const vendor = this.detectVendor(llm);
    const spanBaseName = this.convertClassNameToSpanName(className);
    const spanName = `${spanBaseName}.task`;
    
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      [SpanAttributes.LLM_SYSTEM]: vendor,
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
      [SpanAttributes.LLM_REQUEST_MODEL]: modelName,
      "traceloop.span.kind": "task",
      "traceloop.workflow.name": runName || spanName,
    });

    if (this.traceContent && prompts.length > 0) {
      prompts.forEach((prompt, idx) => {
        span.setAttributes({
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.role`]: "user",
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.content`]: prompt,
        });
      });
    }

    this.spans.set(runId, { span, runId });
  }

  override async handleLLMEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): Promise<void> {
    // End both LLM and task spans
    const llmSpanData = this.spans.get(`${runId}_llm`);
    const taskSpanData = this.spans.get(runId);

    if (llmSpanData) {
      const { span: llmSpan } = llmSpanData;

      if (this.traceContent && output.generations && output.generations.length > 0) {
        output.generations.forEach((generation, idx) => {
          if (generation && generation.length > 0) {
            llmSpan.setAttributes({
              [`${SpanAttributes.LLM_COMPLETIONS}.${idx}.role`]: "assistant",
              [`${SpanAttributes.LLM_COMPLETIONS}.${idx}.content`]: generation[0].text,
            });
          }
        });
      }

      // Add usage metrics if available
      if (output.llmOutput?.usage) {
        const usage = output.llmOutput.usage;
        if (usage.input_tokens) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.input_tokens,
          });
        }
        if (usage.output_tokens) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: usage.output_tokens,
          });
        }
        const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        if (totalTokens > 0) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: totalTokens,
          });
        }
      }
      
      // Also check for tokenUsage format (for compatibility)
      if (output.llmOutput?.tokenUsage) {
        const usage = output.llmOutput.tokenUsage;
        if (usage.promptTokens) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.promptTokens,
          });
        }
        if (usage.completionTokens) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: usage.completionTokens,
          });
        }
        if (usage.totalTokens) {
          llmSpan.setAttributes({
            [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: usage.totalTokens,
          });
        }
      }

      llmSpan.setStatus({ code: SpanStatusCode.OK });
      llmSpan.end();
      this.spans.delete(`${runId}_llm`);
    }

    if (taskSpanData) {
      const { span: taskSpan } = taskSpanData;
      
      if (this.traceContent && output.generations && output.generations.length > 0) {
        const completions = output.generations.map((generation, _idx) => {
          if (generation && generation.length > 0) {
            return generation[0].text;
          }
          return "";
        });
        taskSpan.setAttributes({
          "traceloop.entity.output": JSON.stringify(completions),
        });
      }

      taskSpan.setStatus({ code: SpanStatusCode.OK });
      taskSpan.end();
      this.spans.delete(runId);
    }
  }

  async handleChatModelEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): Promise<void> {
    // Same as handleLLMEnd for chat models
    return this.handleLLMEnd(output, runId, _parentRunId, _tags, _extraParams);
  }

  override async handleLLMError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): Promise<void> {
    // End both spans on error
    const llmSpanData = this.spans.get(`${runId}_llm`);
    const taskSpanData = this.spans.get(runId);

    if (llmSpanData) {
      const { span: llmSpan } = llmSpanData;
      llmSpan.recordException(err);
      llmSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      llmSpan.end();
      this.spans.delete(`${runId}_llm`);
    }

    if (taskSpanData) {
      const { span: taskSpan } = taskSpanData;
      taskSpan.recordException(err);
      taskSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      taskSpan.end();
      this.spans.delete(runId);
    }
  }

  override async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string
  ): Promise<void> {
    const chainName = chain.id?.[chain.id.length - 1] || "unknown";
    const spanName = `${chainName}.workflow`;
    
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      "traceloop.span.kind": "workflow",
      "traceloop.workflow.name": runName || chainName,
    });

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.input": JSON.stringify(inputs),
      });
    }

    this.spans.set(runId, { span, runId });
  }

  override async handleChainEnd(
    outputs: ChainValues,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _kwargs?: { inputs?: Record<string, unknown> }
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.output": JSON.stringify(outputs),
      });
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this.spans.delete(runId);
  }

  override async handleChainError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _kwargs?: { inputs?: Record<string, unknown> }
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.end();
    this.spans.delete(runId);
  }

  override async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string
  ): Promise<void> {
    const toolName = tool.id?.[tool.id.length - 1] || "unknown";
    const spanName = `${toolName}.task`;
    
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      "traceloop.span.kind": "task",
      "traceloop.entity.name": toolName,
    });

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.input": JSON.stringify({ args: [input] }),
      });
    }

    this.spans.set(runId, { span, runId });
  }

  override async handleToolEnd(
    output: any,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.output": JSON.stringify(output),
      });
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this.spans.delete(runId);
  }

  override async handleToolError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[]
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.end();
    this.spans.delete(runId);
  }

  private extractModelName(llm: Serialized): string {
    // Extract from class hierarchy - last element is usually the class name
    const className = llm.id?.[llm.id.length - 1] || "unknown";
    
    // For BedrockChat, try to get the actual model name
    if (className === "BedrockChat") {
      // The model name might be available in kwargs - cast to any to access kwargs
      const llmAny = llm as any;
      const modelId = llmAny.kwargs?.model || llmAny.kwargs?.model_id;
      if (modelId && typeof modelId === 'string') {
        // Extract clean model name from full ID (e.g., "us.anthropic.claude-3-7-sonnet-20250219-v1:0" -> "claude-3-7-sonnet")
        const parts = modelId.split('.');
        if (parts.length >= 3) {
          const modelPart = parts.slice(2).join('.').split(':')[0]; // Remove region and version
          return modelPart.replace('-20250219-v1', ''); // Clean up version suffix
        }
        return modelId;
      }
    }
    
    return className;
  }

  private convertClassNameToSpanName(className: string): string {
    // Convert PascalCase to lowercase with dots
    // BedrockChat -> bedrock.chat
    // ChatOpenAI -> chat.openai
    return className
      .replace(/([A-Z])/g, (match, char, index) => {
        return index === 0 ? char.toLowerCase() : `.${char.toLowerCase()}`;
      });
  }

  private detectVendor(llm: Serialized): string {
    const className = llm.id?.[llm.id.length - 1] || "";
    
    // Follow Python implementation - map class names to vendors
    if (className.includes("OpenAI") || className.includes("GPT")) {
      return "OpenAI";
    }
    if (className.includes("Anthropic") || className.includes("Claude")) {
      return "Anthropic";
    }
    if (className.includes("Bedrock") || className === "BedrockChat") {
      // Python implementation returns "AWS" for all Bedrock classes
      return "AWS";
    }
    if (className.includes("Vertex")) {
      return "Google";
    }
    if (className.includes("Azure")) {
      return "Azure";
    }
    if (className.includes("Hugging")) {
      return "HuggingFace";
    }
    if (className.includes("Ollama")) {
      return "Ollama";
    }
    if (className.includes("Cohere")) {
      return "Cohere";
    }
    
    return "LangChain";
  }

  private mapMessageTypeToRole(messageType: string): string {
    // Map LangChain message types to standard OpenTelemetry roles
    switch (messageType) {
      case "human":
        return "user";
      case "ai":
        return "assistant";
      case "system":
        return "system";
      case "function":
        return "tool";
      default:
        return messageType;
    }
  }
}