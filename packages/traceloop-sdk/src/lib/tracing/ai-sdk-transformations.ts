import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const AI_RESPONSE_TEXT = "ai.response.text";
const AI_PROMPT_MESSAGES = "ai.prompt.messages";
const AI_USAGE_PROMPT_TOKENS = "ai.usage.promptTokens";
const AI_USAGE_COMPLETION_TOKENS = "ai.usage.completionTokens";
const AI_MODEL_PROVIDER = "ai.model.provider";

export const transformAiSdkSpanName = (span: ReadableSpan): void => {
  const nameMap: Record<string, string> = {
    [AI_GENERATE_TEXT_DO_GENERATE]: "ai.generateText.generate",
    [AI_STREAM_TEXT_DO_STREAM]: "ai.streamText.stream",
  };

  if (span.name in nameMap) {
    // Unfortunately, the span name is not writable as this is not the intended behavior
    // but it is a workaround to set the correct span name
    (span as any).name = nameMap[span.name];
  }
};

export const transformResponseText = (
  attributes: Record<string, any>,
): void => {
  if (AI_RESPONSE_TEXT in attributes) {
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] =
      attributes[AI_RESPONSE_TEXT];
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
    delete attributes[AI_RESPONSE_TEXT];
  }
};

export const transformPromptMessages = (
  attributes: Record<string, any>,
): void => {
  if (AI_PROMPT_MESSAGES in attributes) {
    try {
      const messages = JSON.parse(attributes[AI_PROMPT_MESSAGES] as string);
      messages.forEach((msg: { role: string; content: any }, index: number) => {
        attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.content`] =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] = msg.role;
      });
      delete attributes[AI_PROMPT_MESSAGES];
    } catch {
      // Skip if JSON parsing fails
    }
  }
};

export const transformPromptTokens = (
  attributes: Record<string, any>,
): void => {
  if (AI_USAGE_PROMPT_TOKENS in attributes) {
    attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`] =
      attributes[AI_USAGE_PROMPT_TOKENS];
    delete attributes[AI_USAGE_PROMPT_TOKENS];
  }
};

export const transformCompletionTokens = (
  attributes: Record<string, any>,
): void => {
  if (AI_USAGE_COMPLETION_TOKENS in attributes) {
    attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`] =
      attributes[AI_USAGE_COMPLETION_TOKENS];
    delete attributes[AI_USAGE_COMPLETION_TOKENS];
  }
};

export const calculateTotalTokens = (attributes: Record<string, any>): void => {
  const promptTokens = attributes[`${SpanAttributes.LLM_USAGE_PROMPT_TOKENS}`];
  const completionTokens =
    attributes[`${SpanAttributes.LLM_USAGE_COMPLETION_TOKENS}`];

  if (promptTokens && completionTokens) {
    attributes[`${SpanAttributes.LLM_USAGE_TOTAL_TOKENS}`] =
      Number(promptTokens) + Number(completionTokens);
  }
};

export const transformVendor = (attributes: Record<string, any>): void => {
  if (AI_MODEL_PROVIDER in attributes) {
    const vendor = attributes[AI_MODEL_PROVIDER];
    if (vendor && vendor.startsWith("openai")) {
      attributes[SpanAttributes.LLM_SYSTEM] = "OpenAI";
    } else {
      attributes[SpanAttributes.LLM_SYSTEM] = vendor;
    }
    delete attributes[AI_MODEL_PROVIDER];
  }
};

export const transformAiSdkAttributes = (
  attributes: Record<string, any>,
): void => {
  transformResponseText(attributes);
  transformPromptMessages(attributes);
  transformPromptTokens(attributes);
  transformCompletionTokens(attributes);
  calculateTotalTokens(attributes);
  transformVendor(attributes);
};

export const transformAiSdkSpan = (span: ReadableSpan): void => {
  transformAiSdkSpanName(span);
  transformAiSdkAttributes(span.attributes);
};
