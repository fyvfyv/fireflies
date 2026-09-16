import { describe, expect, it } from "vitest";
import { HttpError } from "../http/errors.js";
import { uploadPolicy } from "./policy.js";

describe("uploadPolicy", () => {
  it.each([
    "evil/a.webm",
    "a.webm",
    "recordings",
    "recordings/",
    "recordings/nested/a.webm",
    "recordings/../a.webm",
    "recordings/%2e%2e/a.webm",
    "/recordings/a.webm",
  ])("rejects %s", (pathname) => {
    expect(() => uploadPolicy(pathname)).toThrow(
      expect.objectContaining({
        constructor: HttpError,
        status: 400,
        code: "bad_pathname",
        retryable: false,
      }),
    );
  });

  it("accepts the pathname the client upload generates", () => {
    expect(() =>
      uploadPolicy("recordings/0b7c5a4e-3f5d-4c1a-9e7b-2d1f0a6c8b9e.m4a"),
    ).not.toThrow();
  });

  it("allows only audio types", () => {
    const { allowedContentTypes } = uploadPolicy("recordings/a.webm");

    expect(allowedContentTypes).toEqual(
      expect.arrayContaining(["audio/webm", "audio/mp4"]),
    );
    expect(allowedContentTypes?.every((t) => t.startsWith("audio/"))).toBe(
      true,
    );
  });

  it("caps the size at 25 MiB and keeps the pathname as given", () => {
    expect(uploadPolicy("recordings/a.webm")).toMatchObject({
      maximumSizeInBytes: 25 * 1024 * 1024,
      addRandomSuffix: false,
    });
  });
});
