import { upload } from "@vercel/blob/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAudio } from "./upload";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const mockedUpload = vi.mocked(upload);

describe("uploadAudio", () => {
  beforeEach(() => {
    mockedUpload.mockReset();
    mockedUpload.mockImplementation(async (pathname) => ({
      url: `https://store.private.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
      pathname,
      contentType: "audio/webm",
      contentDisposition: "inline",
      etag: "etag",
    }));
  });

  it("uploads privately through the token route and returns what the create call needs", async () => {
    const blob = new Blob(["12345"], { type: "audio/webm" });

    const result = await uploadAudio(blob, "audio/webm");

    expect(mockedUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^recordings\/[0-9a-f-]{36}\.webm$/),
      blob,
      {
        access: "private",
        handleUploadUrl: "/api/upload",
        contentType: "audio/webm",
      },
    );
    expect(result).toEqual({
      pathname: mockedUpload.mock.calls[0]?.[0],
      sizeBytes: 5,
      contentType: "audio/webm",
    });
  });

  it("names each upload afresh, with an m4a extension for mp4", async () => {
    await uploadAudio(new Blob(["abc"]), "audio/mp4");
    await uploadAudio(new Blob(["abc"]), "audio/mp4");

    const [first, second] = mockedUpload.mock.calls.map(([path]) => path);
    expect(first).toMatch(/\.m4a$/);
    expect(first).not.toBe(second);
  });

  it("rejects unsupported types before uploading", async () => {
    await expect(uploadAudio(new Blob(["x"]), "video/mp4")).rejects.toThrow(
      "Unsupported audio type",
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
