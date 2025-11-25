import * as fs from "fs";
import * as path from "path";

/**
 * File cell types for attachments
 */
export type FileCellType = "image" | "video" | "audio" | "file";

/**
 * Storage types for attachments
 */
export type FileStorageType = "internal" | "external";

/**
 * Metadata for attachments
 */
export interface AttachmentMetadata {
  [key: string]: string | number | boolean;
}

/**
 * MIME type mapping for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

/**
 * Detects file type from MIME type
 */
function detectFileType(contentType: string): FileCellType {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Gets MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Options for creating an Attachment
 */
export interface AttachmentOptions {
  /** Path to local file (mutually exclusive with data) */
  filePath?: string;
  /** In-memory file data (mutually exclusive with filePath) */
  data?: Buffer | Uint8Array;
  /** Filename (required if using data, optional override for filePath) */
  filename?: string;
  /** MIME type (auto-detected if not provided) */
  contentType?: string;
  /** File type category (auto-detected if not provided) */
  fileType?: FileCellType;
  /** Additional metadata */
  metadata?: AttachmentMetadata;
}

/**
 * Represents a file attachment to be uploaded to a dataset cell.
 * Supports both local file paths and in-memory data.
 *
 * @example
 * // From file path
 * const attachment = new Attachment({ filePath: "./image.png" });
 *
 * @example
 * // From buffer
 * const attachment = new Attachment({
 *   data: myBuffer,
 *   filename: "document.pdf",
 *   contentType: "application/pdf"
 * });
 */
export class Attachment {
  readonly type = "attachment" as const;

  private _filePath?: string;
  private _data?: Buffer | Uint8Array;
  private _filename?: string;
  private _contentType?: string;
  private _fileType?: FileCellType;
  private _metadata?: AttachmentMetadata;

  constructor(options: AttachmentOptions) {
    const { filePath, data, filename, contentType, fileType, metadata } =
      options;

    if (!filePath && !data) {
      throw new Error("Either filePath or data must be provided");
    }
    if (filePath && data) {
      throw new Error("Cannot provide both filePath and data");
    }
    if (data && !filename) {
      throw new Error("filename is required when using data");
    }

    this._filePath = filePath;
    this._data = data;
    this._filename = filename;
    this._contentType = contentType;
    this._fileType = fileType;
    this._metadata = metadata;
  }

  /**
   * Gets the file data as a Buffer
   */
  async getData(): Promise<Buffer> {
    if (this._data) {
      return Buffer.isBuffer(this._data)
        ? this._data
        : Buffer.from(this._data);
    }
    if (this._filePath) {
      return fs.promises.readFile(this._filePath);
    }
    throw new Error("No data source available");
  }

  /**
   * Gets the filename
   */
  getFileName(): string {
    if (this._filename) {
      return this._filename;
    }
    if (this._filePath) {
      return path.basename(this._filePath);
    }
    throw new Error("No filename available");
  }

  /**
   * Gets the content type (MIME type)
   */
  getContentType(): string {
    if (this._contentType) {
      return this._contentType;
    }
    return getMimeType(this.getFileName());
  }

  /**
   * Gets the file type category
   */
  get fileType(): FileCellType {
    if (this._fileType) {
      return this._fileType;
    }
    return detectFileType(this.getContentType());
  }

  /**
   * Gets the metadata
   */
  get metadata(): AttachmentMetadata | undefined {
    return this._metadata;
  }
}

/**
 * Options for creating an ExternalAttachment
 */
export interface ExternalAttachmentOptions {
  /** External URL */
  url: string;
  /** Optional filename */
  filename?: string;
  /** Optional content type */
  contentType?: string;
  /** File type category (defaults to "file") */
  fileType?: FileCellType;
  /** Additional metadata */
  metadata?: AttachmentMetadata;
}

/**
 * Represents an external URL attachment for a dataset cell.
 * The file is not uploaded; only the URL is stored.
 *
 * @example
 * const attachment = new ExternalAttachment({
 *   url: "https://example.com/document.pdf",
 *   fileType: "file"
 * });
 */
export class ExternalAttachment {
  readonly type = "external" as const;

  private _url: string;
  private _filename?: string;
  private _contentType?: string;
  private _fileType: FileCellType;
  private _metadata?: AttachmentMetadata;

  constructor(options: ExternalAttachmentOptions) {
    const { url, filename, contentType, fileType, metadata } = options;

    if (!url || typeof url !== "string") {
      throw new Error("URL is required and must be a string");
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error("Invalid URL provided");
    }

    this._url = url;
    this._filename = filename;
    this._contentType = contentType;
    this._fileType = fileType || "file";
    this._metadata = metadata;
  }

  get url(): string {
    return this._url;
  }

  get filename(): string | undefined {
    return this._filename;
  }

  get contentType(): string | undefined {
    return this._contentType;
  }

  get fileType(): FileCellType {
    return this._fileType;
  }

  get metadata(): AttachmentMetadata | undefined {
    return this._metadata;
  }
}

/**
 * Represents a reference to an uploaded or external attachment.
 * Returned after an attachment is successfully processed.
 */
export class AttachmentReference {
  constructor(
    readonly storageType: FileStorageType,
    readonly storageKey: string,
    readonly url: string | undefined,
    readonly fileType: FileCellType,
    readonly metadata?: AttachmentMetadata,
  ) {}

  /**
   * Downloads the attachment data
   * @param filePath Optional path to save the file (Node.js only)
   * @returns Buffer if no filePath provided, void if saved to file
   */
  async download(filePath?: string): Promise<Buffer | void> {
    if (!this.url) {
      throw new Error("Cannot download attachment: no URL available");
    }

    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download attachment: ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (filePath) {
      await fs.promises.writeFile(filePath, buffer);
      return;
    }

    return buffer;
  }

  /**
   * Gets the download URL (for external attachments)
   */
  getUrl(): string | undefined {
    return this.url;
  }

  /**
   * Converts to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      storageType: this.storageType,
      storageKey: this.storageKey,
      url: this.url,
      fileType: this.fileType,
      metadata: this.metadata,
    };
  }
}

// Type guards

/**
 * Checks if a value is an Attachment instance
 */
export function isAttachment(value: unknown): value is Attachment {
  return value instanceof Attachment || (value as any)?.type === "attachment";
}

/**
 * Checks if a value is an ExternalAttachment instance
 */
export function isExternalAttachment(
  value: unknown,
): value is ExternalAttachment {
  return (
    value instanceof ExternalAttachment || (value as any)?.type === "external"
  );
}

/**
 * Checks if a value is an AttachmentReference instance
 */
export function isAttachmentReference(
  value: unknown,
): value is AttachmentReference {
  return (
    value instanceof AttachmentReference ||
    ((value as any)?.storageType !== undefined &&
      (value as any)?.storageKey !== undefined)
  );
}

/**
 * Checks if a value is any attachment type
 */
export function isAnyAttachment(
  value: unknown,
): value is Attachment | ExternalAttachment {
  return isAttachment(value) || isExternalAttachment(value);
}

// Factory helpers

/**
 * Convenience factory for creating attachments
 *
 * @example
 * // From file
 * attachment.file("./image.png")
 *
 * @example
 * // From buffer
 * attachment.buffer(myBuffer, "doc.pdf")
 *
 * @example
 * // External URL
 * attachment.url("https://example.com/file.pdf")
 */
export const attachment = {
  /**
   * Creates an Attachment from a file path
   */
  file: (
    filePath: string,
    options?: {
      filename?: string;
      contentType?: string;
      fileType?: FileCellType;
      metadata?: AttachmentMetadata;
    },
  ): Attachment => {
    return new Attachment({
      filePath,
      ...options,
    });
  },

  /**
   * Creates an Attachment from in-memory data
   */
  buffer: (
    data: Buffer | Uint8Array,
    filename: string,
    options?: {
      contentType?: string;
      fileType?: FileCellType;
      metadata?: AttachmentMetadata;
    },
  ): Attachment => {
    return new Attachment({
      data,
      filename,
      ...options,
    });
  },

  /**
   * Creates an ExternalAttachment from a URL
   */
  url: (
    url: string,
    options?: {
      filename?: string;
      contentType?: string;
      fileType?: FileCellType;
      metadata?: AttachmentMetadata;
    },
  ): ExternalAttachment => {
    return new ExternalAttachment({
      url,
      ...options,
    });
  },
};
