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
import { Tracer, SpanKind, SpanStatusCode } from "@opentelemetry/api";
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
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string,
  ): Promise<void> {
    const className = llm.id?.[llm.id.length - 1] || "unknown";
    const vendor = this.detectVendor(llm);
    const spanBaseName = this.convertClassNameToSpanName(className);

    // Create single LLM span like Python implementation
    const span = this.tracer.startSpan(spanBaseName, {
      kind: SpanKind.CLIENT,
    });

    const flatMessages = messages.flat();
    span.setAttributes({
      [SpanAttributes.LLM_SYSTEM]: vendor,
      [SpanAttributes.LLM_REQUEST_TYPE]: "chat",
    });

    // Add prompts if tracing content
    if (this.traceContent && flatMessages.length > 0) {
      flatMessages.forEach((message, idx) => {
        const role = this.mapMessageTypeToRole(message._getType());
        span.setAttributes({
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.role`]: role,
          [`${SpanAttributes.LLM_PROMPTS}.${idx}.content`]:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
      });
    }

    this.spans.set(runId, { span, runId });
  }

  override async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string,
  ): Promise<void> {
    const className = llm.id?.[llm.id.length - 1] || "unknown";
    const vendor = this.detectVendor(llm);
    const spanBaseName = this.convertClassNameToSpanName(className);

    // Create single LLM span like handleChatModelStart
    const span = this.tracer.startSpan(spanBaseName, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      [SpanAttributes.LLM_SYSTEM]: vendor,
      [SpanAttributes.LLM_REQUEST_TYPE]: "completion",
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
    _extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;

    if (
      this.traceContent &&
      output.generations &&
      output.generations.length > 0
    ) {
      output.generations.forEach((generation, idx) => {
        if (generation && generation.length > 0) {
          span.setAttributes({
            [`${SpanAttributes.LLM_COMPLETIONS}.${idx}.role`]: "assistant",
            [`${SpanAttributes.LLM_COMPLETIONS}.${idx}.content`]:
              generation[0].text,
          });
        }
      });
    }

    // Extract model name from response only, like Python implementation
    const modelName = this.extractModelNameFromResponse(output);

    // Set both request and response model attributes like Python implementation
    span.setAttributes({
      [SpanAttributes.LLM_REQUEST_MODEL]: modelName || "unknown",
      [SpanAttributes.LLM_RESPONSE_MODEL]: modelName || "unknown",
    });

    // Add usage metrics if available
    if (output.llmOutput?.usage) {
      const usage = output.llmOutput.usage;
      if (usage.input_tokens) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.input_tokens,
        });
      }
      if (usage.output_tokens) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: usage.output_tokens,
        });
      }
      const totalTokens =
        (usage.input_tokens || 0) + (usage.output_tokens || 0);
      if (totalTokens > 0) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: totalTokens,
        });
      }
    }

    // Also check for tokenUsage format (for compatibility)
    if (output.llmOutput?.tokenUsage) {
      const usage = output.llmOutput.tokenUsage;
      if (usage.promptTokens) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.promptTokens,
        });
      }
      if (usage.completionTokens) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]: usage.completionTokens,
        });
      }
      if (usage.totalTokens) {
        span.setAttributes({
          [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]: usage.totalTokens,
        });
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this.spans.delete(runId);
  }

  async handleChatModelEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>,
  ): Promise<void> {
    // Same as handleLLMEnd for chat models
    return this.handleLLMEnd(output, runId, _parentRunId, _tags, _extraParams);
  }

  override async handleLLMError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.end();
    this.spans.delete(runId);
  }

  override async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
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
    _kwargs?: { inputs?: Record<string, unknown> },
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
    _kwargs?: { inputs?: Record<string, unknown> },
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
    _runName?: string,
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
    _tags?: string[],
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
    _tags?: string[],
  ): Promise<void> {
    const spanData = this.spans.get(runId);
    if (!spanData) return;

    const { span } = spanData;
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.end();
    this.spans.delete(runId);
  }

  private extractModelNameFromResponse(output: LLMResult): string | null {
    // Follow Python implementation - extract from llm_output first
    if (output.llmOutput) {
      const modelName =
        output.llmOutput.model_name ||
        output.llmOutput.model_id ||
        output.llmOutput.model;
      if (modelName && typeof modelName === "string") {
        return modelName;
      }
    }

    return null;
  }

  private convertClassNameToSpanName(className: string): string {
    // Convert PascalCase to lowercase with dots
    // BedrockChat -> bedrock.chat
    // ChatOpenAI -> chat.openai
    return className.replace(/([A-Z])/g, (match, char, index) => {
      return index === 0 ? char.toLowerCase() : `.${char.toLowerCase()}`;
    });
  }

  private detectVendor(llm: Serialized): string {
    const className = llm.id?.[llm.id.length - 1] || "";

    if (!className) {
      return "Langchain";
    }

    // Follow Python implementation with exact matches and patterns
    // Ordered by specificity (most specific first)

    // Azure (most specific - check first)
    if (
      ["AzureChatOpenAI", "AzureOpenAI", "AzureOpenAIEmbeddings"].includes(
        className,
      ) ||
      className.toLowerCase().includes("azure")
    ) {
      return "Azure";
    }

    // OpenAI
    if (
      ["ChatOpenAI", "OpenAI", "OpenAIEmbeddings"].includes(className) ||
      className.toLowerCase().includes("openai")
    ) {
      return "openai";
    }

    // AWS Bedrock
    if (
      ["ChatBedrock", "BedrockEmbeddings", "Bedrock", "BedrockChat"].includes(
        className,
      ) ||
      className.toLowerCase().includes("bedrock") ||
      className.toLowerCase().includes("aws")
    ) {
      return "AWS";
    }

    // Anthropic
    if (
      ["ChatAnthropic", "AnthropicLLM"].includes(className) ||
      className.toLowerCase().includes("anthropic")
    ) {
      return "Anthropic";
    }

    // Google (Vertex/PaLM/Gemini)
    if (
      [
        "ChatVertexAI",
        "VertexAI",
        "VertexAIEmbeddings",
        "ChatGoogleGenerativeAI",
        "GoogleGenerativeAI",
        "GooglePaLM",
        "ChatGooglePaLM",
      ].includes(className) ||
      className.toLowerCase().includes("vertex") ||
      className.toLowerCase().includes("google") ||
      className.toLowerCase().includes("palm") ||
      className.toLowerCase().includes("gemini")
    ) {
      return "Google";
    }

    // Cohere
    if (
      ["ChatCohere", "CohereEmbeddings", "Cohere"].includes(className) ||
      className.toLowerCase().includes("cohere")
    ) {
      return "Cohere";
    }

    // HuggingFace
    if (
      [
        "HuggingFacePipeline",
        "HuggingFaceTextGenInference",
        "HuggingFaceEmbeddings",
        "ChatHuggingFace",
      ].includes(className) ||
      className.toLowerCase().includes("huggingface")
    ) {
      return "HuggingFace";
    }

    // Ollama
    if (
      ["ChatOllama", "OllamaEmbeddings", "Ollama"].includes(className) ||
      className.toLowerCase().includes("ollama")
    ) {
      return "Ollama";
    }

    // Together
    if (
      ["Together", "ChatTogether"].includes(className) ||
      className.toLowerCase().includes("together")
    ) {
      return "Together";
    }

    // Replicate
    if (
      ["Replicate", "ChatReplicate"].includes(className) ||
      className.toLowerCase().includes("replicate")
    ) {
      return "Replicate";
    }

    return "Langchain";
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
