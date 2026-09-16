import type { PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAudio } from "./upload";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const mockedUpload = vi.mocked(upload);

function putResult(pathname: string, contentType: string): PutBlobResult {
  return {
    url: `https://store.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
    pathname,
    contentType,
    contentDisposition: "inline",
    etag: "etag",
  };
}

describe("uploadAudio", () => {
  beforeEach(() => {
    mockedUpload.mockReset();
    mockedUpload.mockImplementation(async (pathname, _body, options) =>
      putResult(pathname, options.contentType ?? ""),
    );
  });

  it("uploads privately through the token route", async () => {
    const blob = new Blob(["abc"], { type: "audio/webm" });

    await uploadAudio(blob, "audio/webm");

    expect(mockedUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^recordings\/[0-9a-f-]{36}\.webm$/),
      blob,
      {
        access: "private",
        handleUploadUrl: "/api/upload",
        contentType: "audio/webm",
      },
    );
  });

  it("names mp4 audio with an m4a extension", async () => {
    await uploadAudio(new Blob(["abc"]), "audio/mp4");

    expect(mockedUpload.mock.calls[0]?.[0]).toMatch(/\.m4a$/);
  });

  it("uses a fresh pathname per upload", async () => {
    const blob = new Blob(["abc"]);
    await uploadAudio(blob, "audio/webm");
    await uploadAudio(blob, "audio/webm");

    const [first, second] = mockedUpload.mock.calls.map(([p]) => p);
    expect(first).not.toBe(second);
  });

  it("returns what the create call needs", async () => {
    const blob = new Blob(["12345"], { type: "audio/mpeg" });

    const result = await uploadAudio(blob, "audio/mpeg");

    expect(result).toEqual({
      pathname: mockedUpload.mock.calls[0]?.[0],
      sizeBytes: 5,
      contentType: "audio/mpeg",
    });
  });

  it("propagates upload failures", async () => {
    mockedUpload.mockRejectedValueOnce(new Error("Failed to retrieve token"));

    await expect(uploadAudio(new Blob(["x"]), "audio/webm")).rejects.toThrow(
      "Failed to retrieve token",
    );
  });

  it("rejects unsupported types before uploading", async () => {
    await expect(uploadAudio(new Blob(["x"]), "video/mp4")).rejects.toThrow(
      "Unsupported audio type",
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
