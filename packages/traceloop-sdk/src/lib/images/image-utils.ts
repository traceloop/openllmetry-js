import { readFile } from "fs/promises";
import { extname } from "path";

export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export interface ProcessedImage {
  filename: string;
  base64Data: string;
  mimeType: string;
}

export type ImageUploadCallback = (
  traceId: string,
  spanId: string,
  filename: string,
  base64Data: string
) => Promise<string>;

const MIME_TYPE_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

export async function processImageFile(
  image: any,
  index: number = 0
): Promise<ProcessedImage | null> {
  try {
    let imageData: Buffer;
    let filename: string;
    let mimeType: string;

    // Handle different input types
    if (typeof image === "string") {
      // File path
      imageData = await readFile(image);
      filename = image.split("/").pop() || `image_${index}`;
      const ext = extname(image).toLowerCase();
      mimeType = MIME_TYPE_MAP[ext] || "application/octet-stream";
    } else if (image && typeof image === "object") {
      // Handle File-like objects (Browser File API, Node.js streams, etc.)
      if (image.arrayBuffer && typeof image.arrayBuffer === "function") {
        // Browser File API
        const arrayBuffer = await image.arrayBuffer();
        imageData = Buffer.from(arrayBuffer);
        filename = image.name || `image_${index}`;
        mimeType = image.type || "application/octet-stream";
      } else if (image.read && typeof image.read === "function") {
        // Node.js readable stream
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
          image.on("data", (chunk: Buffer) => chunks.push(chunk));
          image.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const base64Data = buffer.toString("base64");
            const name = image.path || `image_${index}`;
            const ext = extname(name).toLowerCase();
            resolve({
              filename: name,
              base64Data,
              mimeType: MIME_TYPE_MAP[ext] || "application/octet-stream",
            });
          });
          image.on("error", reject);
        });
      } else if (Buffer.isBuffer(image)) {
        // Buffer
        imageData = image;
        filename = `image_${index}.bin`;
        mimeType = "application/octet-stream";
      } else {
        return null;
      }
    } else {
      return null;
    }

    const base64Data = imageData.toString("base64");
    
    return {
      filename,
      base64Data,
      mimeType,
    };
  } catch (error) {
    console.error(`Error processing image at index ${index}:`, error);
    return null;
  }
}

export async function processAndUploadImage(
  image: any,
  index: number,
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback
): Promise<ImageContent | null> {
  const processedImage = await processImageFile(image, index);
  if (!processedImage) {
    return null;
  }

  try {
    const url = await uploadCallback(
      traceId,
      spanId,
      processedImage.filename,
      processedImage.base64Data
    );

    return {
      type: "image_url",
      image_url: {
        url,
      },
    };
  } catch (error) {
    console.error("Failed to upload image:", error);
    return null;
  }
}

export async function processImageArray(
  images: any[] | any,
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback
): Promise<ImageContent[]> {
  const imageArray = Array.isArray(images) ? images : [images];
  const results: ImageContent[] = [];

  for (let i = 0; i < imageArray.length; i++) {
    const imageContent = await processAndUploadImage(
      imageArray[i],
      i,
      traceId,
      spanId,
      uploadCallback
    );
    
    if (imageContent) {
      results.push(imageContent);
    }
  }

  return results;
}

export function isBase64String(str: string): boolean {
  try {
    // Check if it's a valid base64 string
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

export function isDataUrl(str: string): boolean {
  return str.startsWith("data:image/");
}

export function extractBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;
}