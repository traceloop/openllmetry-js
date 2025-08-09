import { trace, Span, SpanKind, Attributes } from "@opentelemetry/api";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import type { ImageUploadCallback } from "./types";

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
  response_format?: string;
  user?: string;
}

export interface ImageEditRequest {
  image: any;
  prompt: string;
  mask?: any;
  model?: string;
  n?: number;
  size?: string;
  response_format?: string;
  user?: string;
}

export interface ImageVariationRequest {
  image: any;
  model?: string;
  n?: number;
  size?: string;
  response_format?: string;
  user?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

async function processImageInRequest(
  image: any,
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback,
  index: number = 0
): Promise<string | null> {
  try {
    let base64Data: string;
    let filename: string;

    if (typeof image === "string") {
      // Could be a file path, base64 string, or URL
      if (image.startsWith("data:image/")) {
        // Data URL
        const commaIndex = image.indexOf(",");
        base64Data = image.substring(commaIndex + 1);
        filename = `input_image_${index}.png`;
      } else if (image.startsWith("http")) {
        // URL - we can't process this directly
        return null;
      } else {
        // Assume it's base64 or file path
        base64Data = image;
        filename = `input_image_${index}.png`;
      }
    } else if (image && typeof image === "object") {
      // Handle File objects or other binary data
      if (image.arrayBuffer && typeof image.arrayBuffer === "function") {
        const arrayBuffer = await image.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        base64Data = btoa(String.fromCharCode.apply(null, Array.from(buffer)));
        filename = image.name || `input_image_${index}.png`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    const url = await uploadCallback(traceId, spanId, filename, base64Data);
    return url;
  } catch (error) {
    console.error("Error processing image in request:", error);
    return null;
  }
}

export function setImageGenerationRequestAttributes(
  span: Span,
  params: ImageGenerationRequest
): void {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
  }
  
  if (params.size) {
    attributes["llm.request.image.size"] = params.size;
  }
  
  if (params.quality) {
    attributes["llm.request.image.quality"] = params.quality;
  }
  
  if (params.style) {
    attributes["llm.request.image.style"] = params.style;
  }
  
  if (params.n) {
    attributes["llm.request.image.count"] = params.n;
  }

  // Set prompt
  if (params.prompt) {
    attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = params.prompt;
    attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  });
}

export async function setImageEditRequestAttributes(
  span: Span,
  params: ImageEditRequest,
  uploadCallback?: ImageUploadCallback
): Promise<void> {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
  }
  
  if (params.size) {
    attributes["llm.request.image.size"] = params.size;
  }
  
  if (params.n) {
    attributes["llm.request.image.count"] = params.n;
  }

  // Set prompt
  if (params.prompt) {
    attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = params.prompt;
    attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
  }

  // Process input image if upload callback is available
  if (params.image && uploadCallback && span.spanContext().traceId && span.spanContext().spanId) {
    const traceId = span.spanContext().traceId;
    const spanId = span.spanContext().spanId;
    
    const imageUrl = await processImageInRequest(
      params.image,
      traceId,
      spanId,
      uploadCallback,
      0
    );
    
    if (imageUrl) {
      attributes[`${SpanAttributes.LLM_PROMPTS}.1.content`] = JSON.stringify([
        { type: "image_url", image_url: { url: imageUrl } }
      ]);
      attributes[`${SpanAttributes.LLM_PROMPTS}.1.role`] = "user";
    }
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  });
}

export async function setImageVariationRequestAttributes(
  span: Span,
  params: ImageVariationRequest,
  uploadCallback?: ImageUploadCallback
): Promise<void> {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.LLM_REQUEST_MODEL] = params.model;
  }
  
  if (params.size) {
    attributes["llm.request.image.size"] = params.size;
  }
  
  if (params.n) {
    attributes["llm.request.image.count"] = params.n;
  }

  // Process input image if upload callback is available
  if (params.image && uploadCallback && span.spanContext().traceId && span.spanContext().spanId) {
    const traceId = span.spanContext().traceId;
    const spanId = span.spanContext().spanId;
    
    const imageUrl = await processImageInRequest(
      params.image,
      traceId,
      spanId,
      uploadCallback,
      0
    );
    
    if (imageUrl) {
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.content`] = JSON.stringify([
        { type: "image_url", image_url: { url: imageUrl } }
      ]);
      attributes[`${SpanAttributes.LLM_PROMPTS}.0.role`] = "user";
    }
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  });
}

export async function setImageGenerationResponseAttributes(
  span: Span,
  response: ImageGenerationResponse,
  uploadCallback?: ImageUploadCallback
): Promise<void> {
  const attributes: Attributes = {};

  if (response.data && response.data.length > 0) {
    const firstImage = response.data[0];
    
    // Handle base64 response
    if (firstImage.b64_json && uploadCallback) {
      try {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;
        
        const imageUrl = await uploadCallback(
          traceId,
          spanId,
          "generated_image.png",
          firstImage.b64_json
        );
        
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] = JSON.stringify([
          { type: "image_url", image_url: { url: imageUrl } }
        ]);
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
      } catch (error) {
        console.error("Failed to upload generated image:", error);
      }
    }
    // Handle URL response
    else if (firstImage.url) {
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] = JSON.stringify([
        { type: "image_url", image_url: { url: firstImage.url } }
      ]);
      attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
    }
    
    // Set revised prompt if available
    if (firstImage.revised_prompt) {
      attributes["llm.response.revised_prompt"] = firstImage.revised_prompt;
    }
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  });
}

export function wrapImageGeneration(
  tracer: ReturnType<typeof trace.getTracer>,
  uploadCallback?: ImageUploadCallback
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageGenerationRequest;
      
      const span = tracer.startSpan("openai.images.generate", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.LLM_SYSTEM]: "OpenAI",
          [SpanAttributes.LLM_REQUEST_TYPE]: "image_generation",
        },
      });

      
      const response = original.apply(this, args);
      
      // Handle both promise and direct response
      if (response && typeof response.then === 'function') {
        return response.then(async (result: any) => {
          try {
            setImageGenerationRequestAttributes(span, params);
            await setImageGenerationResponseAttributes(span, result, uploadCallback);
            return result;
          } catch (error) {
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        }).catch((error: Error) => {
          span.recordException(error);
          span.end();
          throw error;
        });
      } else {
        try {
          setImageGenerationRequestAttributes(span, params);
          // For sync responses, we can't await the response processing
          return response;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    };
  };
}

export function wrapImageEdit(
  tracer: ReturnType<typeof trace.getTracer>,
  uploadCallback?: ImageUploadCallback
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageEditRequest;
      
      const span = tracer.startSpan("openai.images.edit", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.LLM_SYSTEM]: "OpenAI",
          [SpanAttributes.LLM_REQUEST_TYPE]: "image_edit",
        },
      });

      
      const response = original.apply(this, args);
      
      // Handle both promise and direct response
      if (response && typeof response.then === 'function') {
        return response.then(async (result: any) => {
          try {
            await setImageEditRequestAttributes(span, params, uploadCallback);
            await setImageGenerationResponseAttributes(span, result, uploadCallback);
            return result;
          } catch (error) {
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        }).catch((error: Error) => {
          span.recordException(error);
          span.end();
          throw error;
        });
      } else {
        try {
          // For sync responses, we can't await the request processing
          return response;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    };
  };
}

export function wrapImageVariation(
  tracer: ReturnType<typeof trace.getTracer>,
  uploadCallback?: ImageUploadCallback
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageVariationRequest;
      
      const span = tracer.startSpan("openai.images.createVariation", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.LLM_SYSTEM]: "OpenAI",
          [SpanAttributes.LLM_REQUEST_TYPE]: "image_variation",
        },
      });

      
      const response = original.apply(this, args);
      
      // Handle both promise and direct response
      if (response && typeof response.then === 'function') {
        return response.then(async (result: any) => {
          try {
            await setImageVariationRequestAttributes(span, params, uploadCallback);
            await setImageGenerationResponseAttributes(span, result, uploadCallback);
            return result;
          } catch (error) {
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        }).catch((error: Error) => {
          span.recordException(error);
          span.end();
          throw error;
        });
      } else {
        try {
          // For sync responses, we can't await the request processing
          return response;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    };
  };
}