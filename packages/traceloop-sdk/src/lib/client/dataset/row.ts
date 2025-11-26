import { TraceloopClient } from "../traceloop-client";
import { BaseDatasetEntity } from "./base-dataset";
import { RowResponse, RowData, RowUpdateOptions } from "../../interfaces";
import {
  Attachment,
  ExternalAttachment,
  AttachmentReference,
  isAttachmentReference,
} from "./attachment";
import { AttachmentUploader } from "./attachment-uploader";

export class Row extends BaseDatasetEntity {
  private _data: RowResponse;
  private _deleted = false;

  constructor(client: TraceloopClient, data: RowResponse) {
    super(client);
    this._data = data;
  }

  get id(): string {
    return this._data.id;
  }

  get datasetId(): string {
    return this._data.datasetId;
  }

  get datasetSlug(): string {
    return this._data.datasetSlug;
  }

  get data(): RowData {
    return { ...this._data.data };
  }

  get createdAt(): string {
    return this._data.createdAt;
  }

  get updatedAt(): string {
    return this._data.updatedAt;
  }

  get deleted(): boolean {
    return this._deleted;
  }

  getValue(
    columnName: string,
  ): string | number | boolean | Date | null | object {
    const value = this._data.data[columnName];
    return value !== undefined ? value : null;
  }

  hasColumn(columnName: string): boolean {
    return columnName in this._data.data;
  }

  getColumns(): string[] {
    return Object.keys(this._data.data);
  }

  async update(options: RowUpdateOptions): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot update a deleted row");
    }

    if (!options.data || typeof options.data !== "object") {
      throw new Error("Update data must be a valid object");
    }

    const updatedData = { ...this._data.data, ...options.data };

    const response = await this.client.put(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
      {
        Values: updatedData,
      },
    );

    const result = await this.handleResponse(response);

    if (result && result.id) {
      this._data = result;
    }
  }

  async partialUpdate(updates: Partial<RowData>): Promise<void> {
    if (this._deleted) {
      throw new Error("Cannot update a deleted row");
    }

    if (!updates || typeof updates !== "object") {
      throw new Error("Updates must be a valid object");
    }

    const response = await this.client.put(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
      {
        Values: updates,
      },
    );

    const result = await this.handleResponse(response);

    if (result && result.id) {
      this._data = result;
    }
  }

  async delete(): Promise<void> {
    if (this._deleted) {
      throw new Error("Row is already deleted");
    }

    const response = await this.client.delete(
      `/v2/datasets/${this.datasetSlug}/rows/${this.id}`,
    );
    await this.handleResponse(response);
    this._deleted = true;
  }

  toJSON(): RowData {
    return { ...this._data.data };
  }

  toCSVRow(columns?: string[], delimiter = ","): string {
    const columnsToUse = columns || this.getColumns();
    const values = columnsToUse.map((column) => {
      const value = this._data.data[column];
      if (value === null || value === undefined) {
        return "";
      }

      const stringValue = String(value);

      if (
        stringValue.includes(delimiter) ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    });

    return values.join(delimiter);
  }

  validate(columnValidators?: {
    [columnName: string]: (value: any) => boolean;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (columnValidators) {
      Object.keys(columnValidators).forEach((columnName) => {
        const validator = columnValidators[columnName];
        const value = this._data.data[columnName];

        if (!validator(value)) {
          errors.push(`Invalid value for column '${columnName}': ${value}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  clone(): Row {
    const clonedData: RowResponse = {
      ...this._data,
      data: { ...this._data.data },
    };

    return new Row(this.client, clonedData);
  }

  /**
   * Gets an attachment reference from a column
   * @param columnName The name of the column containing the attachment
   * @returns AttachmentReference if the column contains an attachment, null otherwise
   */
  getAttachment(columnName: string): AttachmentReference | null {
    const value = this._data.data[columnName];

    if (!value || typeof value !== "object") {
      return null;
    }

    // Value is now guaranteed to be an object
    const objValue = value as object;

    // Check if value is already an AttachmentReference
    if (objValue instanceof AttachmentReference) {
      return objValue;
    }

    // Check if value is a serialized attachment reference
    if (isAttachmentReference(objValue)) {
      const ref = objValue as any;
      return new AttachmentReference(
        ref.storageType,
        ref.storageKey,
        ref.url,
        ref.fileType,
        ref.metadata,
      );
    }

    return null;
  }

  /**
   * Checks if a column contains an attachment
   * @param columnName The name of the column to check
   */
  hasAttachment(columnName: string): boolean {
    return this.getAttachment(columnName) !== null;
  }

  /**
   * Sets/uploads an attachment to a column
   * @param columnSlug The slug of the column to set the attachment in
   * @param attachment The attachment to upload (Attachment or ExternalAttachment)
   * @returns The created AttachmentReference
   *
   * @example
   * // Upload from file
   * await row.setAttachment("image", new Attachment({ filePath: "./photo.jpg" }));
   *
   * @example
   * // Set external URL
   * await row.setAttachment("document", new ExternalAttachment({ url: "https://example.com/doc.pdf" }));
   */
  async setAttachment(
    columnSlug: string,
    attachment: Attachment | ExternalAttachment,
  ): Promise<AttachmentReference> {
    if (this._deleted) {
      throw new Error("Cannot set attachment on a deleted row");
    }

    const uploader = new AttachmentUploader(this.client);
    const reference = await uploader.processAnyAttachment(
      this.datasetSlug,
      this.id,
      columnSlug,
      attachment,
    );

    // Update internal data
    this._data.data[columnSlug] = reference.toJSON() as any;

    return reference;
  }

  /**
   * Downloads an attachment from a column
   * @param columnName The name of the column containing the attachment
   * @param outputPath Optional file path to save the downloaded file
   * @returns Buffer if no outputPath provided, void if saved to file
   *
   * @example
   * // Get as buffer
   * const data = await row.downloadAttachment("image");
   *
   * @example
   * // Save to file
   * await row.downloadAttachment("image", "./downloaded-image.png");
   */
  async downloadAttachment(
    columnName: string,
    outputPath?: string,
  ): Promise<Buffer | void> {
    if (this._deleted) {
      throw new Error("Cannot download attachment from a deleted row");
    }

    const attachment = this.getAttachment(columnName);
    if (!attachment) {
      throw new Error(`No attachment found in column '${columnName}'`);
    }

    return attachment.download(outputPath);
  }
}
