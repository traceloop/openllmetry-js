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
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
} from "@opentelemetry/semantic-conventions/incubating";
import { FinishReasons } from "@traceloop/ai-semantic-conventions";

// Combined finish reason map covering all providers LangChain wraps.
// Unknown reasons pass through unchanged via the `?? reason` fallback.
//
// NOTE FOR REVIEWERS: This is intentionally a single flat map as a stopgap.
// A follow-up PR (`feat/centralize-finish-reason-maps`) will move all per-provider
// finish reason maps (Anthropic, OpenAI, and this one) into @traceloop/instrumentation-utils
// so they can be shared across all instrumentations. At that point this map will be
// replaced with per-provider imports from that package.
const langchainFinishReasonMap: Record<string, string> = {
  // OpenAI / Azure / Together
  stop: FinishReasons.STOP,
  length: FinishReasons.LENGTH,
  tool_calls: FinishReasons.TOOL_CALL, // plural → singular
  content_filter: FinishReasons.CONTENT_FILTER,
  function_call: FinishReasons.TOOL_CALL, // deprecated
  // Anthropic / Bedrock (Anthropic models)
  end_turn: FinishReasons.STOP,
  stop_sequence: FinishReasons.STOP,
  tool_use: FinishReasons.TOOL_CALL,
  max_tokens: FinishReasons.LENGTH,
  // Google (Vertex AI / Gemini)
  STOP: FinishReasons.STOP,
  MAX_TOKENS: FinishReasons.LENGTH,
  SAFETY: FinishReasons.CONTENT_FILTER,
  RECITATION: FinishReasons.CONTENT_FILTER,
  // Cohere
  COMPLETE: FinishReasons.STOP,
  ERROR_TOXIC: FinishReasons.CONTENT_FILTER,
};

interface SpanData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  span: any;
  runId: string;
  operationType: string;
  requestModel?: string;
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
    const requestModel = this.extractModelFromExtraParams(_extraParams);
    const spanName = requestModel
      ? `${operationType} ${requestModel}`
      : `${operationType} ${className}`;

    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });

    const flatMessages = messages.flat();
    span.setAttributes({
      [ATTR_GEN_AI_PROVIDER_NAME]: vendor,
      [ATTR_GEN_AI_OPERATION_NAME]: operationType,
    });
    
    if (requestModel) {
      span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, requestModel);
    }

    if (this.traceContent && flatMessages.length > 0) {
      // TODO: Add a LangChain-specific content block mapper to properly convert
      // structured BaseMessage content (AIMessage.tool_calls, ToolMessage content,
      // ContentBlock arrays) to OTel ToolCallRequestPart / ToolCallResponsePart parts.
      // Currently non-string content is collapsed to a JSON string inside a TextPart,
      // which is a pre-existing limitation (same behavior as before this migration).
      const inputMessages = flatMessages.map((message) => {
        const role = this.mapMessageTypeToRole(message.type);
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

    this.spans.set(runId, { span, runId, operationType, requestModel });
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
    const requestModel = this.extractModelFromExtraParams(_extraParams);
    const spanName = requestModel
      ? `${operationType} ${requestModel}`
      : `${operationType} ${className}`;

    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
    });

    span.setAttributes({
      [ATTR_GEN_AI_PROVIDER_NAME]: vendor,
      [ATTR_GEN_AI_OPERATION_NAME]: operationType,
    });
    
    if (requestModel) {
      span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, requestModel);
    }

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

    this.spans.set(runId, { span, runId, operationType, requestModel });
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

    const { span, operationType, requestModel } = spanData;

    // Extract model name from response (llmOutput) or fall back to request model
    const responseModel = this.extractModelNameFromResponse(output);
    const model = responseModel || requestModel;

    // Update span name if we got a better model name from the response
    if (responseModel && responseModel !== requestModel) {
      span.updateName(`${operationType} ${responseModel}`);
    }

    span.setAttributes({
      [ATTR_GEN_AI_REQUEST_MODEL]: requestModel || model,
      [ATTR_GEN_AI_RESPONSE_MODEL]: model,
    });

    // Set response ID if available (providers may expose it in llmOutput)
    const responseId = this.extractResponseId(output);
    if (responseId) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, responseId);
    }

    // Collect finish reasons from ALL candidates across ALL generation groups.
    // LLMResult.generations is Generation[][] where outer = prompt batch, inner = n candidates.
    // ATTR_GEN_AI_RESPONSE_FINISH_REASONS should contain one entry per candidate (OTel spec).
    const allFinishReasons: string[] = [];
    if (output.generations) {
      for (const group of output.generations) {
        if (group) {
          for (const gen of group) {
            const raw =
              gen?.generationInfo?.finish_reason ||
              gen?.generationInfo?.stop_reason ||
              gen?.generationInfo?.done_reason ||
              null;
            if (raw) {
              allFinishReasons.push(langchainFinishReasonMap[raw] ?? raw);
            }
          }
        }
      }
    }

    // Set finish reasons on span (metadata — NOT gated by traceContent)
    if (allFinishReasons.length > 0) {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, allFinishReasons);
    }

    if (
      this.traceContent &&
      output.generations &&
      output.generations.length > 0
    ) {
      // TODO: Use gen.message (BaseMessage) instead of gen.text to capture structured
      // output content including tool calls. Requires the same LangChain content block
      // mapper as the input messages TODO above. Pre-existing limitation.
      // flatMap over all candidates in all groups — one output message per candidate
      const outputMessages = output.generations.flatMap((group) =>
        (group ?? []).map((gen) => {
          const raw =
            gen?.generationInfo?.finish_reason ||
            gen?.generationInfo?.stop_reason ||
            gen?.generationInfo?.done_reason ||
            null;
          const genFinishReason = raw
            ? (langchainFinishReasonMap[raw] ?? raw)
            : "";
          return {
            role: "assistant",
            parts: [{ type: "text", content: gen?.text ?? "" }],
            finish_reason: genFinishReason,
          };
        }),
      );
      span.setAttribute(
        ATTR_GEN_AI_OUTPUT_MESSAGES,
        JSON.stringify(outputMessages),
      );
    }

    // Add usage metrics if available
    if (output.llmOutput?.usage) {
      const usage = output.llmOutput.usage;
      if (usage.input_tokens || usage.input_tokens === 0) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.input_tokens);
      }
      if (usage.output_tokens || usage.output_tokens === 0) {
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.output_tokens);
      }
      const hasUsage =
        usage.input_tokens != null || usage.output_tokens != null;
      if (hasUsage) {
        const totalTokens =
          (usage.input_tokens || 0) + (usage.output_tokens || 0);
        span.setAttribute(
          SpanAttributes.GEN_AI_USAGE_TOTAL_TOKENS,
          totalTokens,
        );
      }
    }

    // Also check for tokenUsage format (for compatibility)
    if (output.llmOutput?.tokenUsage) {
      const usage = output.llmOutput.tokenUsage;
      if (usage.promptTokens || usage.promptTokens === 0) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.promptTokens);
      }
      if (usage.completionTokens || usage.completionTokens === 0) {
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          usage.completionTokens,
        );
      }
      if (usage.totalTokens || usage.totalTokens === 0) {
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

  // Parameter order follows @langchain/core >=1.0.0.
  // The 0.3.x signature had a different order (parentRunId at pos 4, runType at pos 7, runName at pos 8).
  // peerDependencies requires >=1.0.0 to ensure this signature matches at runtime.
  override async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    _runType?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
    _parentRunId?: string,
    _extra?: Record<string, unknown>,
  ): Promise<void> {
    const chainName = chain.id?.[chain.id.length - 1] || "unknown";
    const displayName = runName || chainName;

    // Detect whether this chain is an agent executor vs a regular chain.
    // Both pass runType: undefined in LangChain 1.x, so we use the class name.
    // Only agent executors get invoke_agent; regular chains use "workflow" (custom,
    // no OTel well-known value exists for generic chain execution).
    const isAgent = this.isAgentChain(chainName);
    const operationName = isAgent
      ? GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      : "workflow";

    const span = this.tracer.startSpan(`${operationName} ${displayName}`, {
      kind: SpanKind.INTERNAL,
    });

    const attributes: Record<string, string> = {
      [ATTR_GEN_AI_OPERATION_NAME]: operationName,
      [ATTR_GEN_AI_PROVIDER_NAME]: "langchain",
      // Backward compatibility
      "traceloop.span.kind": "workflow",
      "traceloop.workflow.name": displayName,
    };

    if (isAgent) {
      attributes[ATTR_GEN_AI_AGENT_NAME] = displayName;
    }

    span.setAttributes(attributes);

    if (this.traceContent) {
      span.setAttributes({
        "traceloop.entity.input": JSON.stringify(inputs),
      });
    }

    this.spans.set(runId, {
      span,
      runId,
      operationType: operationName,
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

  private extractModelFromExtraParams(
    extraParams?: Record<string, unknown>,
  ): string | undefined {
    // LangChain passes invocation_params in extraParams for handleChatModelStart/handleLLMStart
    // which contains the model name from the provider SDK (e.g., "gpt-4o-mini")
    const invocationParams = extraParams?.invocation_params as
      | Record<string, unknown>
      | undefined;
    const model = invocationParams?.model ?? invocationParams?.model_name;
    return model && typeof model === "string" ? model : undefined;
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

    // Google Vertex AI (aiplatform.googleapis.com)
    if (
      ["ChatVertexAI", "VertexAI", "VertexAIEmbeddings"].includes(className) ||
      className.toLowerCase().includes("vertex")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI;
    }

    // Google Gemini / AI Studio (generativelanguage.googleapis.com)
    if (
      [
        "ChatGoogleGenerativeAI",
        "GoogleGenerativeAI",
        "GoogleGenerativeAIEmbeddings",
      ].includes(className) ||
      className.toLowerCase().includes("gemini")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI;
    }

    // Google PaLM / generic Google (fallback)
    if (
      ["GooglePaLM", "ChatGooglePaLM"].includes(className) ||
      className.toLowerCase().includes("google") ||
      className.toLowerCase().includes("palm")
    ) {
      return GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI;
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

  private isAgentChain(chainName: string): boolean {
    const lower = chainName.toLowerCase();
    return (
      lower.includes("agent") ||
      lower.includes("executor") ||
      lower === "agentexecutor"
    );
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
