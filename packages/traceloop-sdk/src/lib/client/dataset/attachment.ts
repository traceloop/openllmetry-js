import * as fs from "fs";
import * as path from "path";
import * as mime from "mime-types";

export type FileCellType = "image" | "video" | "audio" | "file";

export type FileStorageType = "internal" | "external";

export interface AttachmentMetadata {
  [key: string]: string | number | boolean;
}

function detectFileType(contentType: string): FileCellType {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "file";
}

function getMimeType(filename: string): string {
  return mime.lookup(filename) || "application/octet-stream";
}

export interface AttachmentOptions {
  filePath?: string;
  data?: Buffer | Uint8Array;
  filename?: string;
  contentType?: string;
  fileType?: FileCellType;
  metadata?: AttachmentMetadata;
}

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

  async getData(): Promise<Buffer> {
    if (this._data) {
      return Buffer.isBuffer(this._data) ? this._data : Buffer.from(this._data);
    }
    if (this._filePath) {
      return fs.promises.readFile(this._filePath);
    }
    throw new Error("No data source available");
  }

  getFileName(): string {
    if (this._filename) {
      return this._filename;
    }
    if (this._filePath) {
      return path.basename(this._filePath);
    }
    throw new Error("No filename available");
  }

  getContentType(): string {
    if (this._contentType) {
      return this._contentType;
    }
    return getMimeType(this.getFileName());
  }

  get fileType(): FileCellType {
    if (this._fileType) {
      return this._fileType;
    }
    return detectFileType(this.getContentType());
  }

  get metadata(): AttachmentMetadata | undefined {
    return this._metadata;
  }
}

export interface ExternalAttachmentOptions {
  url: string;
  filename?: string;
  contentType?: string;
  fileType?: FileCellType;
  metadata?: AttachmentMetadata;
}

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

export class AttachmentReference {
  constructor(
    readonly storageType: FileStorageType,
    readonly storageKey: string,
    readonly url: string | undefined,
    readonly fileType: FileCellType,
    readonly metadata?: AttachmentMetadata,
  ) {}

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

  getUrl(): string | undefined {
    return this.url;
  }

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

export function isAttachment(value: unknown): value is Attachment {
  return value instanceof Attachment || (value as any)?.type === "attachment";
}

export function isExternalAttachment(
  value: unknown,
): value is ExternalAttachment {
  return (
    value instanceof ExternalAttachment || (value as any)?.type === "external"
  );
}

export function isAttachmentReference(
  value: unknown,
): value is AttachmentReference {
  return (
    value instanceof AttachmentReference ||
    ((value as any)?.storageType !== undefined &&
      (value as any)?.storageKey !== undefined)
  );
}

export function isAnyAttachment(
  value: unknown,
): value is Attachment | ExternalAttachment {
  return isAttachment(value) || isExternalAttachment(value);
}

export const attachment = {
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
