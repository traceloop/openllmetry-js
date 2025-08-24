import { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";

const AI_GENERATE_TEXT_DO_GENERATE = "ai.generateText.doGenerate";
const AI_GENERATE_OBJECT_DO_GENERATE = "ai.generateObject.doGenerate";
const AI_STREAM_TEXT_DO_STREAM = "ai.streamText.doStream";
const HANDLED_SPAN_NAMES: Record<string, string> = {
  [AI_GENERATE_TEXT_DO_GENERATE]: "ai.generateText.generate",
  [AI_GENERATE_OBJECT_DO_GENERATE]: "ai.generateObject.generate",
  [AI_STREAM_TEXT_DO_STREAM]: "ai.streamText.stream",
};

const AI_RESPONSE_TEXT = "ai.response.text";
const AI_RESPONSE_OBJECT = "ai.response.object";
const AI_RESPONSE_TOOL_CALLS = "ai.response.toolCalls";
const AI_PROMPT_MESSAGES = "ai.prompt.messages";
const AI_PROMPT = "ai.prompt";
const AI_USAGE_PROMPT_TOKENS = "ai.usage.promptTokens";
const AI_USAGE_COMPLETION_TOKENS = "ai.usage.completionTokens";
const AI_MODEL_PROVIDER = "ai.model.provider";
const AI_PROMPT_TOOLS = "ai.prompt.tools";

export const transformAiSdkSpanName = (span: ReadableSpan): void => {
  // Unfortunately, the span name is not writable as this is not the intended behavior
  // but it is a workaround to set the correct span name
  if (span.name in HANDLED_SPAN_NAMES) {
    (span as any).name = HANDLED_SPAN_NAMES[span.name];
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

export const transformResponseObject = (
  attributes: Record<string, any>,
): void => {
  if (AI_RESPONSE_OBJECT in attributes) {
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] =
      attributes[AI_RESPONSE_OBJECT];
    attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
    delete attributes[AI_RESPONSE_OBJECT];
  }
};

export const transformResponseToolCalls = (
  attributes: Record<string, any>,
): void => {
  if (AI_RESPONSE_TOOL_CALLS in attributes) {
    try {
      const toolCalls = JSON.parse(attributes[AI_RESPONSE_TOOL_CALLS] as string);
      
      // Set role for completion
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
      
      // Transform each tool call
      toolCalls.forEach((toolCall: any, index: number) => {
        if (toolCall.toolCallType === "function") {
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.${index}.name`] = toolCall.toolName;
          attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.tool_calls.${index}.arguments`] = toolCall.args;
        }
      });
      
      delete attributes[AI_RESPONSE_TOOL_CALLS];
    } catch {
      // Skip if JSON parsing fails
    }
  }
};

// Helper function to unescape JSON escape sequences in strings
const unescapeJsonString = (str: string): string => {
  return str
    .replace(/\\'/g, "'")     // Unescape single quotes
    .replace(/\\"/g, '"')     // Unescape double quotes  
    .replace(/\\n/g, '\n')    // Unescape newlines
    .replace(/\\r/g, '\r')    // Unescape carriage returns
    .replace(/\\t/g, '\t')    // Unescape tabs
    .replace(/\\\\/g, '\\');  // Unescape backslashes
};

// Helper function to process message content
const processMessageContent = (content: any): string => {
  // If content is already a string, try to parse it as JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // Check if ALL items are text items
        const allTextItems = parsed.every((item: any) => 
          item && typeof item === 'object' && item.type === "text" && item.text
        );
        
        if (allTextItems && parsed.length > 0) {
          // Extract and join text from all items
          return parsed.map((item: any) => item.text).join(" ");
        } else {
          // Preserve original JSON string if mixed content or non-text items
          return content;
        }
      }
      // For parsed objects, return as JSON string
      return JSON.stringify(parsed);
    } catch {
      // If parsing fails, it might be a simple string with escape sequences
      // Try to unescape it
      return unescapeJsonString(content);
    }
  }
  
  // If content is an array, always extract text items (filter out non-text)
  if (Array.isArray(content)) {
    const textItems = content.filter((item: any) => 
      item && typeof item === 'object' && item.type === "text" && item.text
    );
    
    if (textItems.length > 0) {
      // Extract and join text from text items only
      return textItems.map((item: any) => item.text).join(" ");
    } else {
      // If no text items, preserve as JSON string
      return JSON.stringify(content);
    }
  }
  
  // If content is an object, return as JSON string
  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }
  
  // For other types, convert to string
  return String(content);
};

export const transformTools = (
  attributes: Record<string, any>,
): void => {
  if (AI_PROMPT_TOOLS in attributes) {
    try {
      const tools = attributes[AI_PROMPT_TOOLS];
      if (Array.isArray(tools)) {
        tools.forEach((toolItem: any, index: number) => {
          // Parse tool if it's a string (AI SDK format)
          let tool = toolItem;
          if (typeof toolItem === 'string') {
            try {
              tool = JSON.parse(toolItem);
            } catch (e) {
              return; // Skip invalid JSON
            }
          }
          
          if (tool && typeof tool === 'object') {
            // Extract tool name
            if (tool.name) {
              attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.name`] = tool.name;
            }
            
            // Extract tool description
            if (tool.description) {
              attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.description`] = tool.description;
            }
            
            // Extract tool parameters/arguments
            if (tool.parameters) {
              attributes[`${SpanAttributes.LLM_REQUEST_FUNCTIONS}.${index}.arguments`] = 
                typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters);
            }
          }
        });
      }
      delete attributes[AI_PROMPT_TOOLS];
    } catch (error) {
      // Skip if processing fails
    }
  }
};

export const transformPrompts = (
  attributes: Record<string, any>,
): void => {
  // Handle ai.prompt.messages (array of messages)
  if (AI_PROMPT_MESSAGES in attributes) {
    try {
      const messages = JSON.parse(attributes[AI_PROMPT_MESSAGES] as string);
      messages.forEach((msg: { role: string; content: any }, index: number) => {
        const processedContent = processMessageContent(msg.content);
        const contentKey = `${SpanAttributes.LLM_PROMPTS}.${index}.content`;
        attributes[contentKey] = processedContent;
        attributes[`${SpanAttributes.LLM_PROMPTS}.${index}.role`] = msg.role;
      });
      delete attributes[AI_PROMPT_MESSAGES];
    } catch {
      // Skip if JSON parsing fails
    }
  }

  // Handle ai.prompt (single prompt string)
  if (AI_PROMPT in attributes) {
    try {
      const promptData = JSON.parse(attributes[AI_PROMPT] as string);
      if (promptData.prompt && typeof promptData.prompt === 'string') {
        const unescapedPrompt = unescapeJsonString(promptData.prompt);
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = unescapedPrompt;
        attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
        delete attributes[AI_PROMPT];
      }
    } catch (error) {
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
    if (vendor && (vendor.startsWith("openai") || vendor.includes("openai"))) {
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
  transformResponseObject(attributes);
  transformResponseToolCalls(attributes);
  transformPrompts(attributes);
  transformTools(attributes);
  transformPromptTokens(attributes);
  transformCompletionTokens(attributes);
  calculateTotalTokens(attributes);
  transformVendor(attributes);
};

export const shouldHandleSpan = (span: ReadableSpan): boolean => {
  return span.name in HANDLED_SPAN_NAMES;
};

export const transformAiSdkSpan = (span: ReadableSpan): void => {
  if (!shouldHandleSpan(span)) {
    return;
  }
  transformAiSdkSpanName(span);
  transformAiSdkAttributes(span.attributes);
};
