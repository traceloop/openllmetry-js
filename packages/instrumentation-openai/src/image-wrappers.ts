import { trace, Span, SpanKind, Attributes } from "@opentelemetry/api";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import type { ImageUploadCallback } from "./types";
import type {
  ImageGenerateParams,
  ImageEditParams,
  ImageCreateVariationParams,
  ImagesResponse,
} from "openai/resources/images";

/**
 * Calculate completion tokens for image generation based on OpenAI's actual token costs
 * 
 * Token costs based on OpenAI documentation:
 * Quality    Square (1024×1024)    Portrait (1024×1536)    Landscape (1536×1024)
 * Low        272 tokens            408 tokens              400 tokens
 * Medium     1056 tokens           1584 tokens             1568 tokens  
 * High       4160 tokens           6240 tokens             6208 tokens
 */
function calculateImageGenerationTokens(params: any, imageCount: number): number {
  const size = params?.size || "1024x1024";
  const quality = params?.quality || "standard"; // OpenAI defaults to "standard" which maps to "medium"
  
  // Map quality to token costs
  const tokenCosts: Record<string, Record<string, number>> = {
    "standard": { // Maps to "medium" quality
      "1024x1024": 1056,
      "1024x1536": 1584,
      "1536x1024": 1568,
    },
    "hd": { // Maps to "high" quality  
      "1024x1024": 4160,
      "1024x1536": 6240,
      "1536x1024": 6208,
    }
  };
  
  // For low quality (not supported by OpenAI API directly, but included for completeness)
  if (quality === "low") {
    const lowQualityCosts: Record<string, number> = {
      "1024x1024": 272,
      "1024x1536": 408, 
      "1536x1024": 400,
    };
    return (lowQualityCosts[size] || 272) * imageCount;
  }
  
  // Get tokens per image for the given quality and size
  const tokensPerImage = tokenCosts[quality]?.[size] || tokenCosts["standard"]["1024x1024"];
  
  return tokensPerImage * imageCount;
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
        // Convert buffer to base64 safely without stack overflow
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        base64Data = btoa(binary);
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
  params: ImageGenerateParams
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
  params: ImageEditParams,
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
  params: ImageCreateVariationParams,
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
  response: ImagesResponse,
  uploadCallback?: ImageUploadCallback,
  instrumentationConfig?: { enrichTokens?: boolean },
  params?: any
): Promise<void> {
  const attributes: Attributes = {};

  // Capture response model if available (note: OpenAI Images API doesn't return model in response)
  // The model information is captured in the request attributes

  // Add usage information for image generation
  if (response.data && response.data.length > 0) {
    // Calculate completion tokens based on OpenAI's actual token costs for image generation
    const completionTokens = calculateImageGenerationTokens(params, response.data.length);
    attributes[SpanAttributes.LLM_USAGE_COMPLETION_TOKENS] = completionTokens;
    
    // Calculate prompt tokens if enrichTokens is enabled
    if (instrumentationConfig?.enrichTokens) {
      try {
        let estimatedPromptTokens = 0;
        
        // For text prompts (image generation and editing)
        if (params?.prompt) {
          // Simple token estimation: roughly 4 characters per token for English text
          estimatedPromptTokens += Math.ceil(params.prompt.length / 4);
        }
        
        // For image inputs (editing and variations)
        if (params?.image) {
          // For input images, use a base estimation (actual input image token cost varies by fidelity)
          // OpenAI doesn't specify exact input image token costs, so we use a reasonable estimate
          estimatedPromptTokens += 272; // Base cost similar to generating a low quality 1024x1024 image
        }
        
        if (estimatedPromptTokens > 0) {
          attributes[SpanAttributes.LLM_USAGE_PROMPT_TOKENS] = estimatedPromptTokens;
        }
        
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = estimatedPromptTokens + completionTokens;
      } catch (error) {
        // If token calculation fails, continue without it
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = response.data.length;
      }
    } else {
      // When enrichTokens is disabled, just set total = completion tokens
      attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = completionTokens;
    }
  }

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
    // Handle URL response - fetch and upload to SDK
    else if (firstImage.url && uploadCallback) {
      try {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;
        
        // Fetch the image from OpenAI URL and convert to base64
        const response = await fetch(firstImage.url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // Convert buffer to base64 safely
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64Data = btoa(binary);
        
        const uploadedUrl = await uploadCallback(
          traceId,
          spanId,
          "generated_image.png",
          base64Data
        );
        
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] = JSON.stringify([
          { type: "image_url", image_url: { url: uploadedUrl } }
        ]);
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
      } catch (error) {
        console.error("Failed to fetch and upload generated image:", error);
        // Fallback to original URL if upload fails
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.content`] = JSON.stringify([
          { type: "image_url", image_url: { url: firstImage.url } }
        ]);
        attributes[`${SpanAttributes.LLM_COMPLETIONS}.0.role`] = "assistant";
      }
    }
    // Handle URL response without upload callback
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
  uploadCallback?: ImageUploadCallback,
  instrumentationConfig?: { enrichTokens?: boolean }
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageGenerateParams;
      
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
            await setImageGenerationResponseAttributes(span, result, uploadCallback, instrumentationConfig, params);
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
  uploadCallback?: ImageUploadCallback,
  instrumentationConfig?: { enrichTokens?: boolean }
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageEditParams;
      
      const span = tracer.startSpan("openai.images.edit", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.LLM_SYSTEM]: "OpenAI",
          [SpanAttributes.LLM_REQUEST_TYPE]: "image_edit",
        },
      });

      // Set request attributes asynchronously in parallel with the API call
      const setRequestAttributesPromise = setImageEditRequestAttributes(span, params, uploadCallback)
        .catch(error => {
          console.error("Error setting image edit request attributes:", error);
        });
      
      const response = original.apply(this, args);
      
      // Handle both promise and direct response
      if (response && typeof response.then === 'function') {
        return response.then(async (result: any) => {
          try {
            // Wait for request attributes to be set, then set response attributes
            await setRequestAttributesPromise;
            await setImageGenerationResponseAttributes(span, result, uploadCallback, instrumentationConfig, params);
            return result;
          } catch (error) {
            span.recordException(error as Error);
            throw error;
          } finally {
            span.end();
          }
        }).catch(async (error: Error) => {
          // Wait for request attributes to be set even when there's an error
          await setRequestAttributesPromise;
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
  uploadCallback?: ImageUploadCallback,
  instrumentationConfig?: { enrichTokens?: boolean }
) {
  return function (original: Function) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageCreateVariationParams;
      
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
            await setImageGenerationResponseAttributes(span, result, uploadCallback, instrumentationConfig, params);
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