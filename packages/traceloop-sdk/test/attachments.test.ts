import * as assert from "assert";
import {
  Attachment,
  ExternalAttachment,
  AttachmentReference,
  attachment,
  isAttachment,
  isExternalAttachment,
  isAttachmentReference,
  isAnyAttachment,
} from "../src/lib/client/dataset/attachment";

describe("Attachment Classes Unit Tests", () => {
  describe("Attachment", () => {
    it("should create from file path", () => {
      const att = new Attachment({ filePath: "/path/to/image.png" });

      assert.strictEqual(att.type, "attachment");
      assert.strictEqual(att.getFileName(), "image.png");
      assert.strictEqual(att.getContentType(), "image/png");
      assert.strictEqual(att.fileType, "image");
    });

    it("should create from buffer data", () => {
      const data = Buffer.from("test data");
      const att = new Attachment({
        data,
        filename: "document.pdf",
        contentType: "application/pdf",
      });

      assert.strictEqual(att.type, "attachment");
      assert.strictEqual(att.getFileName(), "document.pdf");
      assert.strictEqual(att.getContentType(), "application/pdf");
      assert.strictEqual(att.fileType, "file");
    });

    it("should create from Uint8Array data", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const att = new Attachment({
        data,
        filename: "data.csv",
      });

      assert.strictEqual(att.getFileName(), "data.csv");
      assert.strictEqual(att.getContentType(), "text/csv");
      assert.strictEqual(att.fileType, "file");
    });

    it("should throw when neither path nor data provided", () => {
      assert.throws(() => {
        new Attachment({});
      }, /Either filePath or data must be provided/);
    });

    it("should throw when both path and data provided", () => {
      assert.throws(() => {
        new Attachment({
          filePath: "/path/to/file",
          data: Buffer.from("data"),
          filename: "file.txt",
        });
      }, /Cannot provide both filePath and data/);
    });

    it("should throw when data provided without filename", () => {
      assert.throws(() => {
        new Attachment({
          data: Buffer.from("data"),
        });
      }, /filename is required when using data/);
    });

    it("should detect MIME type from extension", () => {
      const testCases = [
        { path: "/test.jpg", expected: "image/jpeg" },
        { path: "/test.jpeg", expected: "image/jpeg" },
        { path: "/test.png", expected: "image/png" },
        { path: "/test.gif", expected: "image/gif" },
        { path: "/test.webp", expected: "image/webp" },
        { path: "/test.pdf", expected: "application/pdf" },
        { path: "/test.json", expected: "application/json" },
        { path: "/test.csv", expected: "text/csv" },
        { path: "/test.txt", expected: "text/plain" },
        { path: "/test.mp3", expected: "audio/mpeg" },
        { path: "/test.mp4", expected: "video/mp4" },
        { path: "/test.unknown", expected: "application/octet-stream" },
      ];

      for (const { path, expected } of testCases) {
        const att = new Attachment({ filePath: path });
        assert.strictEqual(
          att.getContentType(),
          expected,
          `Failed for ${path}`,
        );
      }
    });

    it("should detect file type from content type", () => {
      const testCases = [
        { path: "/test.png", expectedType: "image" },
        { path: "/test.mp4", expectedType: "video" },
        { path: "/test.mp3", expectedType: "audio" },
        { path: "/test.pdf", expectedType: "file" },
        { path: "/test.txt", expectedType: "file" },
      ];

      for (const { path, expectedType } of testCases) {
        const att = new Attachment({ filePath: path });
        assert.strictEqual(
          att.fileType,
          expectedType,
          `Failed for ${path}`,
        );
      }
    });

    it("should use provided content type and file type", () => {
      const att = new Attachment({
        filePath: "/test.dat",
        contentType: "custom/type",
        fileType: "video",
      });

      assert.strictEqual(att.getContentType(), "custom/type");
      assert.strictEqual(att.fileType, "video");
    });

    it("should store metadata", () => {
      const metadata = { alt: "Product image", width: 800, height: 600 };
      const att = new Attachment({
        filePath: "/test.png",
        metadata,
      });

      assert.deepStrictEqual(att.metadata, metadata);
    });
  });

  describe("ExternalAttachment", () => {
    it("should create with valid URL", () => {
      const att = new ExternalAttachment({
        url: "https://example.com/file.pdf",
      });

      assert.strictEqual(att.type, "external");
      assert.strictEqual(att.url, "https://example.com/file.pdf");
      assert.strictEqual(att.fileType, "file");
    });

    it("should create with all options", () => {
      const att = new ExternalAttachment({
        url: "https://example.com/video.mp4",
        filename: "custom-name.mp4",
        contentType: "video/mp4",
        fileType: "video",
        metadata: { duration: 120 },
      });

      assert.strictEqual(att.url, "https://example.com/video.mp4");
      assert.strictEqual(att.filename, "custom-name.mp4");
      assert.strictEqual(att.contentType, "video/mp4");
      assert.strictEqual(att.fileType, "video");
      assert.deepStrictEqual(att.metadata, { duration: 120 });
    });

    it("should throw on invalid URL", () => {
      assert.throws(() => {
        new ExternalAttachment({ url: "not-a-valid-url" });
      }, /Invalid URL provided/);
    });

    it("should throw on empty URL", () => {
      assert.throws(() => {
        new ExternalAttachment({ url: "" });
      }, /URL is required/);
    });
  });

  describe("AttachmentReference", () => {
    it("should create with required properties", () => {
      const ref = new AttachmentReference(
        "internal",
        "storage-key-123",
        undefined,
        "image",
      );

      assert.strictEqual(ref.storageType, "internal");
      assert.strictEqual(ref.storageKey, "storage-key-123");
      assert.strictEqual(ref.url, undefined);
      assert.strictEqual(ref.fileType, "image");
    });

    it("should create with all properties", () => {
      const ref = new AttachmentReference(
        "external",
        "ext-key",
        "https://example.com/file.pdf",
        "file",
        { pages: 10 },
      );

      assert.strictEqual(ref.storageType, "external");
      assert.strictEqual(ref.storageKey, "ext-key");
      assert.strictEqual(ref.url, "https://example.com/file.pdf");
      assert.strictEqual(ref.fileType, "file");
      assert.deepStrictEqual(ref.metadata, { pages: 10 });
    });

    it("should convert to JSON", () => {
      const ref = new AttachmentReference(
        "internal",
        "key-123",
        "https://example.com/file",
        "image",
        { alt: "test" },
      );

      const json = ref.toJSON();

      assert.deepStrictEqual(json, {
        storageType: "internal",
        storageKey: "key-123",
        url: "https://example.com/file",
        fileType: "image",
        metadata: { alt: "test" },
      });
    });

    it("should get URL", () => {
      const ref = new AttachmentReference(
        "external",
        "key",
        "https://example.com/file.pdf",
        "file",
      );

      assert.strictEqual(ref.getUrl(), "https://example.com/file.pdf");
    });
  });

  describe("Type Guards", () => {
    it("should identify Attachment instances", () => {
      const att = new Attachment({ filePath: "/test.png" });

      assert.ok(isAttachment(att));
      assert.ok(!isExternalAttachment(att));
      assert.ok(!isAttachmentReference(att));
      assert.ok(isAnyAttachment(att));
    });

    it("should identify ExternalAttachment instances", () => {
      const ext = new ExternalAttachment({ url: "https://example.com/file" });

      assert.ok(!isAttachment(ext));
      assert.ok(isExternalAttachment(ext));
      assert.ok(!isAttachmentReference(ext));
      assert.ok(isAnyAttachment(ext));
    });

    it("should identify AttachmentReference instances", () => {
      const ref = new AttachmentReference("internal", "key", undefined, "file");

      assert.ok(!isAttachment(ref));
      assert.ok(!isExternalAttachment(ref));
      assert.ok(isAttachmentReference(ref));
      assert.ok(!isAnyAttachment(ref));
    });

    it("should return false for non-attachment values", () => {
      const values = [null, undefined, "string", 123, {}, []];

      for (const value of values) {
        assert.ok(!isAttachment(value), `isAttachment failed for ${value}`);
        assert.ok(
          !isExternalAttachment(value),
          `isExternalAttachment failed for ${value}`,
        );
        assert.ok(!isAnyAttachment(value), `isAnyAttachment failed for ${value}`);
      }
    });
  });

  describe("Factory Helpers", () => {
    it("should create Attachment from file path", () => {
      const att = attachment.file("/path/to/image.png");

      assert.ok(att instanceof Attachment);
      assert.strictEqual(att.getFileName(), "image.png");
    });

    it("should create Attachment from file path with options", () => {
      const att = attachment.file("/path/to/data.dat", {
        filename: "custom.csv",
        contentType: "text/csv",
        fileType: "file",
        metadata: { rows: 100 },
      });

      assert.ok(att instanceof Attachment);
      assert.strictEqual(att.getFileName(), "custom.csv");
      assert.strictEqual(att.getContentType(), "text/csv");
      assert.strictEqual(att.fileType, "file");
      assert.deepStrictEqual(att.metadata, { rows: 100 });
    });

    it("should create Attachment from buffer", () => {
      const data = Buffer.from("test");
      const att = attachment.buffer(data, "file.txt");

      assert.ok(att instanceof Attachment);
      assert.strictEqual(att.getFileName(), "file.txt");
    });

    it("should create Attachment from buffer with options", () => {
      const data = Buffer.from("test");
      const att = attachment.buffer(data, "file.txt", {
        contentType: "text/plain",
        fileType: "file",
        metadata: { size: 4 },
      });

      assert.ok(att instanceof Attachment);
      assert.strictEqual(att.getContentType(), "text/plain");
      assert.deepStrictEqual(att.metadata, { size: 4 });
    });

    it("should create ExternalAttachment from URL", () => {
      const ext = attachment.url("https://example.com/doc.pdf");

      assert.ok(ext instanceof ExternalAttachment);
      assert.strictEqual(ext.url, "https://example.com/doc.pdf");
    });

    it("should create ExternalAttachment from URL with options", () => {
      const ext = attachment.url("https://example.com/video.mp4", {
        filename: "video.mp4",
        contentType: "video/mp4",
        fileType: "video",
        metadata: { duration: 60 },
      });

      assert.ok(ext instanceof ExternalAttachment);
      assert.strictEqual(ext.filename, "video.mp4");
      assert.strictEqual(ext.fileType, "video");
    });
  });
});
