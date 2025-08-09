export interface ImageUploadResponse {
  url: string;
}

export interface ImageUploadPayload {
  image_data: string;
}

export class ImageUploader {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async uploadBase64Image(
    traceId: string,
    spanId: string,
    imageName: string,
    base64ImageData: string
  ): Promise<string> {
    try {
      const imageUrl = await this.getImageUrl(traceId, spanId, imageName);
      await this.uploadImageData(imageUrl, base64ImageData);
      return imageUrl;
    } catch (error) {
      console.error("Failed to upload image:", error);
      throw error;
    }
  }

  private async getImageUrl(
    traceId: string,
    spanId: string,
    imageName: string
  ): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/v2/traces/${traceId}/spans/${spanId}/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_name: imageName,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get image URL: ${response.status} ${response.statusText}`
      );
    }

    const result: ImageUploadResponse = await response.json();
    return result.url;
  }

  private async uploadImageData(
    url: string,
    base64ImageData: string
  ): Promise<void> {
    const payload: ImageUploadPayload = {
      image_data: base64ImageData,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to upload image data: ${response.status} ${response.statusText}. ${errorText}`
      );
    }
  }
}