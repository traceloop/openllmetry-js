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
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_AGENT_NAME,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
} from "@opentelemetry/semantic-conventions/incubating";

interface SpanData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  span: any;
  runId: string;
  operationType: string;
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
    const operationType = GEN_AI_OPERATION_NAME_VALUE_CHAT;

    const span = this.tracer.startSpan(`${operationType} ${className}`, {
      kind: SpanKind.CLIENT,
    });

    const flatMessages = messages.flat();
    span.setAttributes({
      [ATTR_GEN_AI_PROVIDER_NAME]: vendor,
      [ATTR_GEN_AI_OPERATION_NAME]: operationType,
    });

    if (this.traceContent && flatMessages.length > 0) {
      const inputMessages = flatMessages.map((message) => {
        const role = this.mapMessageTypeToRole(message._getType());
        const content =
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content);
        return {
          role,
          parts: [{ type: "text", content }],
        };
      });
      span.setAttribute(
        ATTR_GEN_AI_INPUT_MESSAGES,
        JSON.stringify(inputMessages),
      );
    }

    this.spans.set(runId, { span, runId, operationType });
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
    const operationType = GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION;

    const span = this.tracer.startSpan(`${operationType} ${className}`, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      [ATTR_GEN_AI_PROVIDER_NAME]: vendor,
      [ATTR_GEN_AI_OPERATION_NAME]: operationType,
    });

    if (this.traceContent && prompts.length > 0) {
      const inputMessages = prompts.map((prompt) => ({
        role: "user",
        parts: [{ type: "text", content: prompt }],
      }));
      span.setAttribute(
        ATTR_GEN_AI_INPUT_MESSAGES,
        JSON.stringify(inputMessages),
      );
    }

    this.spans.set(runId, { span, runId, operationType });
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

    const { span, operationType } = spanData;

    // Extract model name from response
    const modelName = this.extractModelNameFromResponse(output);

    // Update span name to "{operation} {model}" now that we know the model
    if (modelName) {
      span.updateName(`${operationType} ${modelName}`);
    }

    span.setAttributes({
      [ATTR_GEN_AI_REQUEST_MODEL]: modelName || "unknown",
      [ATTR_GEN_AI_RESPONSE_MODEL]: modelName || "unknown",
    });

    // Set response ID if available (providers may expose it in llmOutput)
    const responseId = this.extractResponseId(output);
    if (responseId) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, responseId);
    }

    // Set finish reasons if available (metadata — NOT gated by traceContent)
    const finishReason = this.extractFinishReason(output);
    if (finishReason) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [finishReason]);
    }

    if (
      this.traceContent &&
      output.generations &&
      output.generations.length > 0
    ) {
      const outputMessages = output.generations.map((generation) => {
        const text =
          generation && generation.length > 0 ? generation[0].text : "";
        return {
          role: "assistant",
          parts: [{ type: "text", content: text }],
          finish_reason: finishReason ?? null,
        };
      });
      span.setAttribute(
        ATTR_GEN_AI_OUTPUT_MESSAGES,
        JSON.stringify(outputMessages),
      );
    }

    // Add usage metrics if available
    if (output.llmOutput?.usage) {
      const usage = output.llmOutput.usage;
      if (usage.input_tokens) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.input_tokens);
      }
      if (usage.output_tokens) {
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.output_tokens);
      }
      const totalTokens =
        (usage.input_tokens || 0) + (usage.output_tokens || 0);
      if (totalTokens > 0) {
        span.setAttribute(SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS, totalTokens);
      }
    }

    // Also check for tokenUsage format (for compatibility)
    if (output.llmOutput?.tokenUsage) {
      const usage = output.llmOutput.tokenUsage;
      if (usage.promptTokens) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.promptTokens);
      }
      if (usage.completionTokens) {
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          usage.completionTokens,
        );
      }
      if (usage.totalTokens) {
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
          usage.totalTokens,
        );
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
    const agentName = runName || chainName;

    const span = this.tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT} ${agentName}`,
      {
        kind: SpanKind.INTERNAL,
      },
    );

    span.setAttributes({
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      [ATTR_GEN_AI_PROVIDER_NAME]: "langchain",
      [ATTR_GEN_AI_AGENT_NAME]: agentName,
      // Backward compatibility
      "traceloop.span.kind": "workflow",
      "traceloop.workflow.name": agentName,
    });

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.input": JSON.stringify(inputs),
      });
    }

    this.spans.set(runId, {
      span,
      runId,
      operationType: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    });
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

    const span = this.tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${toolName}`,
      {
        kind: SpanKind.INTERNAL,
      },
    );

    span.setAttributes({
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      [ATTR_GEN_AI_PROVIDER_NAME]: "langchain",
      // Backward compatibility
      "traceloop.span.kind": "task",
      "traceloop.entity.name": toolName,
    });

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.input": JSON.stringify({ args: [input] }),
      });
    }

    this.spans.set(runId, {
      span,
      runId,
      operationType: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
    });
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

  private extractResponseId(output: LLMResult): string | null {
    // Providers may expose response ID in llmOutput (e.g., OpenAI's chatcmpl-xxx)
    if (output.llmOutput) {
      const id = output.llmOutput.id || output.llmOutput.response_id;
      if (id && typeof id === "string") {
        return id;
      }
    }
    return null;
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

  private extractFinishReason(output: LLMResult): string | null {
    // Try to extract finish reason from LangChain's LLMResult
    // LangChain exposes it in generationInfo or llmOutput
    if (output.generations && output.generations.length > 0) {
      const firstGen = output.generations[0];
      if (firstGen && firstGen.length > 0) {
        const genInfo = firstGen[0].generationInfo;
        if (genInfo) {
          // Different providers use different field names
          const reason =
            genInfo.finish_reason || genInfo.stop_reason || genInfo.done_reason;
          if (reason && typeof reason === "string") {
            return reason;
          }
        }
      }
    }
    return null;
  }

  private detectVendor(llm: Serialized): string {
    const className = llm.id?.[llm.id.length - 1] || "";

    if (!className) {
      return "langchain";
    }

    // Ordered by specificity (most specific first)

    // Azure (most specific - check first)
    if (
      ["AzureChatOpenAI", "AzureOpenAI", "AzureOpenAIEmbeddings"].includes(
        className,
      ) ||
      className.toLowerCase().includes("azure")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI;
    }

    // OpenAI
    if (
      ["ChatOpenAI", "OpenAI", "OpenAIEmbeddings"].includes(className) ||
      className.toLowerCase().includes("openai")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_OPENAI;
    }

    // AWS Bedrock
    if (
      ["ChatBedrock", "BedrockEmbeddings", "Bedrock", "BedrockChat"].includes(
        className,
      ) ||
      className.toLowerCase().includes("bedrock") ||
      className.toLowerCase().includes("aws")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK;
    }

    // Anthropic
    if (
      ["ChatAnthropic", "AnthropicLLM"].includes(className) ||
      className.toLowerCase().includes("anthropic")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC;
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
      return GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI;
    }

    // Cohere
    if (
      ["ChatCohere", "CohereEmbeddings", "Cohere"].includes(className) ||
      className.toLowerCase().includes("cohere")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_COHERE;
    }

    // HuggingFace - no OTel constant, use string
    if (
      [
        "HuggingFacePipeline",
        "HuggingFaceTextGenInference",
        "HuggingFaceEmbeddings",
        "ChatHuggingFace",
      ].includes(className) ||
      className.toLowerCase().includes("huggingface")
    ) {
      return "huggingface";
    }

    // Ollama - no OTel constant, use string
    if (
      ["ChatOllama", "OllamaEmbeddings", "Ollama"].includes(className) ||
      className.toLowerCase().includes("ollama")
    ) {
      return "ollama";
    }

    // Together - no OTel constant, use string
    if (
      ["Together", "ChatTogether"].includes(className) ||
      className.toLowerCase().includes("together")
    ) {
      return "together_ai";
    }

    // Replicate - no OTel constant, use string
    if (
      ["Replicate", "ChatReplicate"].includes(className) ||
      className.toLowerCase().includes("replicate")
    ) {
      return "replicate";
    }

    return "langchain";
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
