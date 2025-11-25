import { TraceloopClient } from "../traceloop-client";
import {
  Attachment,
  ExternalAttachment,
  AttachmentReference,
  FileCellType,
  AttachmentMetadata,
} from "./attachment";


/**
 * Response from the upload URL endpoint
 */
export interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
  expiresAt?: string;
  method?: string;
}

/**
 * Handles attachment upload and registration operations
 */
export class AttachmentUploader {
  constructor(private client: TraceloopClient) {}

  /**
   * Requests a presigned upload URL from the API
   */
  async getUploadUrl(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    fileName: string,
    contentType: string,
    fileType: FileCellType,
    metadata?: AttachmentMetadata,
  ): Promise<UploadUrlResponse> {
    const response = await this.client.post(
      `/v2/datasets/${datasetSlug}/rows/${rowId}/cells/${columnSlug}/upload-url`,
      {
        type: fileType,
        file_name: fileName,
        content_type: contentType,
        metadata: metadata,
      },
    );

    if (!response.ok) {
      let errorMessage = `Failed to get upload URL: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      uploadUrl: data.upload_url,
      storageKey: data.storage_key,
      expiresAt: data.expires_at,
      method: data.method || "PUT",
    };
  }

  /**
   * Uploads file data directly to S3 using the presigned URL
   */
  async uploadToS3(
    uploadUrl: string,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to upload to S3: ${response.status} ${response.statusText}`,
      );
    }
  }

  /**
   * Confirms the upload status with the API
   */
  async confirmUpload(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    status: "success" | "failed",
    metadata?: AttachmentMetadata,
  ): Promise<void> {
    const response = await this.client.put(
      `/v2/datasets/${datasetSlug}/rows/${rowId}/cells/${columnSlug}/upload-status`,
      {
        status,
        metadata,
      },
    );

    if (!response.ok) {
      let errorMessage = `Failed to confirm upload: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * Registers an external URL as an attachment
   */
  async registerExternalUrl(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    url: string,
    fileType: FileCellType,
    metadata?: AttachmentMetadata,
  ): Promise<AttachmentReference> {
    const response = await this.client.post(
      `/v2/datasets/${datasetSlug}/rows/${rowId}/cells/${columnSlug}/external-url`,
      {
        type: fileType,
        url,
        metadata,
      },
    );

    if (!response.ok) {
      let errorMessage = `Failed to register external URL: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return new AttachmentReference(
      "external",
      data.storage_key || "",
      url,
      fileType,
      metadata,
    );
  }

  /**
   * Uploads an Attachment through the full flow:
   * 1. Get presigned URL
   * 2. Upload to S3
   * 3. Confirm upload
   */
  async uploadAttachment(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    attachment: Attachment,
  ): Promise<AttachmentReference> {
    const fileName = attachment.getFileName();
    const contentType = attachment.getContentType();
    const fileType = attachment.fileType;
    const data = await attachment.getData();

    // Step 1: Get presigned upload URL
    const uploadInfo = await this.getUploadUrl(
      datasetSlug,
      rowId,
      columnSlug,
      fileName,
      contentType,
      fileType,
      attachment.metadata,
    );

    // Step 2: Upload to S3
    try {
      await this.uploadToS3(uploadInfo.uploadUrl, data, contentType);
    } catch (error) {
      // Confirm failure and re-throw
      try {
        await this.confirmUpload(
          datasetSlug,
          rowId,
          columnSlug,
          "failed",
          attachment.metadata,
        );
      } catch {
        // Ignore confirmation errors
      }
      throw error;
    }

    // Step 3: Confirm success
    await this.confirmUpload(
      datasetSlug,
      rowId,
      columnSlug,
      "success",
      attachment.metadata,
    );

    return new AttachmentReference(
      "internal",
      uploadInfo.storageKey,
      undefined,
      fileType,
      attachment.metadata,
    );
  }

  /**
   * Processes an ExternalAttachment by registering the URL
   */
  async processExternalAttachment(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    attachment: ExternalAttachment,
  ): Promise<AttachmentReference> {
    return this.registerExternalUrl(
      datasetSlug,
      rowId,
      columnSlug,
      attachment.url,
      attachment.fileType,
      attachment.metadata,
    );
  }

  /**
   * Processes any attachment type (Attachment or ExternalAttachment)
   */
  async processAnyAttachment(
    datasetSlug: string,
    rowId: string,
    columnSlug: string,
    attachmentObj: Attachment | ExternalAttachment,
  ): Promise<AttachmentReference> {
    if (attachmentObj instanceof Attachment) {
      return this.uploadAttachment(
        datasetSlug,
        rowId,
        columnSlug,
        attachmentObj,
      );
    } else {
      return this.processExternalAttachment(
        datasetSlug,
        rowId,
        columnSlug,
        attachmentObj,
      );
    }
  }
}
