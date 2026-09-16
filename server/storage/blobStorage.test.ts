import { del, get, issueSignedToken, presignUrl } from "@vercel/blob";
import { describe, expect, it, vi } from "vitest";
import { blobStorage } from "./blobStorage.js";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

type GetResult = Awaited<ReturnType<typeof get>>;

const T0 = new Date("2026-09-16T12:00:00.000Z");
const pathname = "recordings/a.webm";

describe("blobStorage", () => {
  const storage = blobStorage(() => T0);

  it("reads a private blob's bytes and content type", async () => {
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      blob: { contentType: "audio/webm" },
    } as unknown as GetResult);

    expect(await storage.readAudio(pathname)).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/webm",
    });
    expect(get).toHaveBeenCalledWith(pathname, { access: "private" });
  });

  it.each([
    ["a missing blob", null],
    ["a non-200 answer", { statusCode: 304 }],
  ])("maps %s to a non-retryable audio_missing error", async (_, result) => {
    vi.mocked(get).mockResolvedValueOnce(result as unknown as GetResult);

    await expect(storage.readAudio(pathname)).rejects.toMatchObject({
      status: 404,
      code: "audio_missing",
      retryable: false,
    });
  });

  it("lets a failed delete reach the caller", async () => {
    vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));

    await expect(storage.delete(pathname)).rejects.toThrow("blob down");
    expect(del).toHaveBeenCalledWith(pathname);
  });

  it("presigns an hour-long private GET url and reports the granted expiry", async () => {
    const token = {
      delegationToken: "delegation",
      clientSigningToken: "signing",
      validUntil: T0.getTime() + 30 * 60 * 1000,
    };
    const presignedUrl = "https://store.blob.test/recordings/a.webm?sig=abc";
    vi.mocked(issueSignedToken).mockResolvedValueOnce(token);
    vi.mocked(presignUrl).mockResolvedValueOnce({ presignedUrl });

    expect(await storage.audioUrl(pathname)).toEqual({
      url: presignedUrl,
      expiresAt: "2026-09-16T12:30:00.000Z",
    });
    expect(issueSignedToken).toHaveBeenCalledWith({
      pathname,
      operations: ["get"],
      validUntil: T0.getTime() + 60 * 60 * 1000,
    });
    expect(presignUrl).toHaveBeenCalledWith(token, {
      operation: "get",
      pathname,
      access: "private",
    });
  });
});
