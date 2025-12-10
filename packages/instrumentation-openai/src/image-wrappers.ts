/* eslint-disable @typescript-eslint/no-explicit-any */
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
 * For gpt-image-1:     Square (1024×1024)    Portrait (1024×1536)    Landscape (1536×1024)
 * Low                  272 tokens            408 tokens              400 tokens
 * Medium               1056 tokens           1584 tokens             1568 tokens
 * High                 4160 tokens           6240 tokens             6208 tokens
 *
 * For DALL-E 3:
 * Standard             1056 tokens           1584 tokens             1568 tokens
 * HD                   4160 tokens           6240 tokens             6208 tokens
 */
function calculateImageGenerationTokens(
  params: any,
  imageCount: number,
): number {
  const size = params?.size || "1024x1024";
  const model = params?.model || "dall-e-2";
  const quality = params?.quality || "standard";

  // Token costs for different models and sizes
  let tokensPerImage: number;

  if (model === "dall-e-2") {
    // DALL-E 2 has fixed costs regardless of quality
    const dalle2Costs: Record<string, number> = {
      "256x256": 68,
      "512x512": 272,
      "1024x1024": 1056,
    };
    tokensPerImage = dalle2Costs[size] || 1056;
  } else if (model === "dall-e-3") {
    // DALL-E 3 costs depend on quality and size
    const dalle3Costs: Record<string, Record<string, number>> = {
      standard: {
        "1024x1024": 1056,
        "1024x1792": 1584,
        "1792x1024": 1568,
      },
      hd: {
        "1024x1024": 4160,
        "1024x1792": 6240,
        "1792x1024": 6208,
      },
    };
    tokensPerImage =
      dalle3Costs[quality]?.[size] || dalle3Costs["standard"]["1024x1024"];
  } else {
    // Default fallback for unknown models
    tokensPerImage = 1056;
  }

  return tokensPerImage * imageCount;
}

async function processImageInRequest(
  image: any,
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback,
  index = 0,
): Promise<string | null> {
  try {
    let base64Data: string;
    let filename: string;

    if (typeof image === "string") {
      // Could be a file path, base64 string, or URL
      if (image.startsWith("data:image/")) {
        const commaIndex = image.indexOf(",");
        base64Data = image.substring(commaIndex + 1);
        filename = `input_image_${index}.png`;
      } else if (image.startsWith("http")) {
        return null;
      } else {
        base64Data = image;
        filename = `input_image_${index}.png`;
      }
    } else if (image && typeof image === "object") {
      // Handle Node.js Buffer objects and ReadStream
      if (Buffer.isBuffer(image)) {
        base64Data = image.toString("base64");
        filename = `input_image_${index}.png`;
      } else if (image.read && typeof image.read === "function") {
        const chunks: Buffer[] = [];
        return new Promise((resolve) => {
          image.on("data", (chunk: Buffer) => chunks.push(chunk));
          image.on("end", async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const base64Data = buffer.toString("base64");
              const filename = image.path || `input_image_${index}.png`;
              const url = await uploadCallback(
                traceId,
                spanId,
                filename,
                base64Data,
              );
              resolve(url);
            } catch (error) {
              console.error("Error processing stream image:", error);
              resolve(null);
            }
          });
          image.on("error", (error: Error) => {
            console.error("Error reading image stream:", error);
            resolve(null);
          });
        });
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
  params: ImageGenerateParams,
): void {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.ATTR_GEN_AI_REQUEST_MODEL] = params.model;
  }

  if (params.size) {
    attributes["gen_ai.request.image.size"] = params.size;
  }

  if (params.quality) {
    attributes["gen_ai.request.image.quality"] = params.quality;
  }

  if (params.style) {
    attributes["gen_ai.request.image.style"] = params.style;
  }

  if (params.n) {
    attributes["gen_ai.request.image.count"] = params.n;
  }

  if (params.prompt) {
    attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`] =
      params.prompt;
    attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`] = "user";
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
  uploadCallback?: ImageUploadCallback,
): Promise<void> {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.ATTR_GEN_AI_REQUEST_MODEL] = params.model;
  }

  if (params.size) {
    attributes["gen_ai.request.image.size"] = params.size;
  }

  if (params.n) {
    attributes["gen_ai.request.image.count"] = params.n;
  }

  if (params.prompt) {
    attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`] =
      params.prompt;
    attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`] = "user";
  }

  // Process input image if upload callback is available
  if (
    params.image &&
    uploadCallback &&
    span.spanContext().traceId &&
    span.spanContext().spanId
  ) {
    const traceId = span.spanContext().traceId;
    const spanId = span.spanContext().spanId;

    const imageUrl = await processImageInRequest(
      params.image,
      traceId,
      spanId,
      uploadCallback,
      0,
    );

    if (imageUrl) {
      attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.1.content`] =
        JSON.stringify([{ type: "image_url", image_url: { url: imageUrl } }]);
      attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.1.role`] = "user";
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
  uploadCallback?: ImageUploadCallback,
): Promise<void> {
  const attributes: Attributes = {};

  if (params.model) {
    attributes[SpanAttributes.ATTR_GEN_AI_REQUEST_MODEL] = params.model;
  }

  if (params.size) {
    attributes["gen_ai.request.image.size"] = params.size;
  }

  if (params.n) {
    attributes["gen_ai.request.image.count"] = params.n;
  }

  // Process input image if upload callback is available
  if (
    params.image &&
    uploadCallback &&
    span.spanContext().traceId &&
    span.spanContext().spanId
  ) {
    const traceId = span.spanContext().traceId;
    const spanId = span.spanContext().spanId;

    const imageUrl = await processImageInRequest(
      params.image,
      traceId,
      spanId,
      uploadCallback,
      0,
    );

    if (imageUrl) {
      attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.content`] =
        JSON.stringify([{ type: "image_url", image_url: { url: imageUrl } }]);
      attributes[`${SpanAttributes.ATTR_GEN_AI_PROMPT}.0.role`] = "user";
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
  params?: any,
): Promise<void> {
  const attributes: Attributes = {};

  if (response.data && response.data.length > 0) {
    const completionTokens = calculateImageGenerationTokens(
      params,
      response.data.length,
    );
    attributes[SpanAttributes.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS] =
      completionTokens;

    // Calculate prompt tokens if enrichTokens is enabled
    if (instrumentationConfig?.enrichTokens) {
      try {
        let estimatedPromptTokens = 0;

        if (params?.prompt) {
          estimatedPromptTokens += Math.ceil(params.prompt.length / 4);
        }

        if (params?.image) {
          estimatedPromptTokens += 272;
        }

        if (estimatedPromptTokens > 0) {
          attributes[SpanAttributes.ATTR_GEN_AI_USAGE_PROMPT_TOKENS] =
            estimatedPromptTokens;
        }

        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] =
          estimatedPromptTokens + completionTokens;
      } catch {
        attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = completionTokens;
      }
    } else {
      attributes[SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = completionTokens;
    }
  }

  if (response.data && response.data.length > 0) {
    const firstImage = response.data[0];

    if (firstImage.b64_json && uploadCallback) {
      try {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;

        const imageUrl = await uploadCallback(
          traceId,
          spanId,
          "generated_image.png",
          firstImage.b64_json,
        );

        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`] =
          JSON.stringify([{ type: "image_url", image_url: { url: imageUrl } }]);
        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`] =
          "assistant";
      } catch (error) {
        console.error("Failed to upload generated image:", error);
      }
    } else if (firstImage.url && uploadCallback) {
      try {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;

        const response = await fetch(firstImage.url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString("base64");

        const uploadedUrl = await uploadCallback(
          traceId,
          spanId,
          "generated_image.png",
          base64Data,
        );

        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`] =
          JSON.stringify([
            { type: "image_url", image_url: { url: uploadedUrl } },
          ]);
        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`] =
          "assistant";
      } catch (error) {
        console.error("Failed to fetch and upload generated image:", error);
        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`] =
          JSON.stringify([
            { type: "image_url", image_url: { url: firstImage.url } },
          ]);
        attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`] =
          "assistant";
      }
    } else if (firstImage.url) {
      attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.content`] =
        JSON.stringify([
          { type: "image_url", image_url: { url: firstImage.url } },
        ]);
      attributes[`${SpanAttributes.ATTR_GEN_AI_COMPLETION}.0.role`] =
        "assistant";
    }

    if (firstImage.revised_prompt) {
      attributes["gen_ai.response.revised_prompt"] = firstImage.revised_prompt;
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
  instrumentationConfig?: { enrichTokens?: boolean },
) {
  return function (original: (...args: any[]) => any) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageGenerateParams;

      const span = tracer.startSpan("openai.images.generate", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.ATTR_GEN_AI_SYSTEM]: "OpenAI",
          "gen_ai.request.type": "image_generation",
        },
      });

      const response = original.apply(this, args);

      if (response && typeof response.then === "function") {
        return response
          .then(async (result: any) => {
            try {
              setImageGenerationRequestAttributes(span, params);
              await setImageGenerationResponseAttributes(
                span,
                result,
                uploadCallback,
                instrumentationConfig,
                params,
              );
              return result;
            } catch (error) {
              span.recordException(error as Error);
              throw error;
            } finally {
              span.end();
            }
          })
          .catch((error: Error) => {
            span.recordException(error);
            span.end();
            throw error;
          });
      } else {
        try {
          setImageGenerationRequestAttributes(span, params);
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
  instrumentationConfig?: { enrichTokens?: boolean },
) {
  return function (original: (...args: any[]) => any) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageEditParams;

      const span = tracer.startSpan("openai.images.edit", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.ATTR_GEN_AI_SYSTEM]: "OpenAI",
          "gen_ai.request.type": "image_edit",
        },
      });

      const setRequestAttributesPromise = setImageEditRequestAttributes(
        span,
        params,
        uploadCallback,
      ).catch((error) => {
        console.error("Error setting image edit request attributes:", error);
      });

      const response = original.apply(this, args);

      if (response && typeof response.then === "function") {
        return response
          .then(async (result: any) => {
            try {
              await setRequestAttributesPromise;
              await setImageGenerationResponseAttributes(
                span,
                result,
                uploadCallback,
                instrumentationConfig,
                params,
              );
              return result;
            } catch (error) {
              span.recordException(error as Error);
              throw error;
            } finally {
              span.end();
            }
          })
          .catch(async (error: Error) => {
            await setRequestAttributesPromise;
            span.recordException(error);
            span.end();
            throw error;
          });
      } else {
        try {
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
  instrumentationConfig?: { enrichTokens?: boolean },
) {
  return function (original: (...args: any[]) => any) {
    return function (this: any, ...args: any[]) {
      const params = args[0] as ImageCreateVariationParams;

      const span = tracer.startSpan("openai.images.createVariation", {
        kind: SpanKind.CLIENT,
        attributes: {
          [SpanAttributes.ATTR_GEN_AI_SYSTEM]: "OpenAI",
          "gen_ai.request.type": "image_variation",
        },
      });

      const response = original.apply(this, args);

      if (response && typeof response.then === "function") {
        return response
          .then(async (result: any) => {
            try {
              await setImageVariationRequestAttributes(
                span,
                params,
                uploadCallback,
              );
              await setImageGenerationResponseAttributes(
                span,
                result,
                uploadCallback,
                instrumentationConfig,
                params,
              );
              return result;
            } catch (error) {
              span.recordException(error as Error);
              throw error;
            } finally {
              span.end();
            }
          })
          .catch((error: Error) => {
            span.recordException(error);
            span.end();
            throw error;
          });
      } else {
        try {
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
