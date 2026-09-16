import { handleUpload } from "@vercel/blob/client";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
} from "../../shared/constants.js";
import { createApp } from "../app.js";
import { postJson } from "../test/requests.js";
import { testDeps } from "../test/testDeps.js";

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async ({ body, onBeforeGenerateToken }) => ({
    type: "blob.generate-client-token",
    clientToken: JSON.stringify(
      await onBeforeGenerateToken(body.payload.pathname, null, false),
    ),
  })),
}));

const tokenRequest = (pathname: string) => ({
  type: "blob.generate-client-token",
  payload: { pathname, clientPayload: null, multipart: false },
});

describe("POST /api/upload", () => {
  const app = createApp(testDeps());
  const upload = (body: unknown) => postJson(app, "/api/upload", body);

  it("issues a token for the generated pathname, restricted to audio under the size cap", async () => {
    const pathname = "recordings/0b7c5a4e-3f5d-4c1a-9e7b-2d1f0a6c8b9e.m4a";

    const res = await upload({
      type: "blob.generate-client-token",
      payload: { pathname },
    });

    expect(res.status).toBe(200);
    const { clientToken } = (await res.json()) as { clientToken: string };
    expect(JSON.parse(clientToken)).toEqual({
      allowedContentTypes: ALLOWED_AUDIO_TYPES,
      maximumSizeInBytes: MAX_AUDIO_BYTES,
      addRandomSuffix: false,
    });
    expect(vi.mocked(handleUpload)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: tokenRequest(pathname),
        request: expect.any(Request),
      }),
    );
  });

  it.each([
    "evil/a.webm",
    "recordings/",
    "/recordings/a.webm",
    "recordings/nested/a.webm",
    "recordings/../a.webm",
    "recordings/%2e%2e/a.webm",
  ])("refuses a token for %s", async (pathname) => {
    const res = await upload(tokenRequest(pathname));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "bad_pathname", retryable: false },
    });
  });

  it.each([
    ["without type", { payload: { pathname: "recordings/a.webm" } }],
    [
      "for completion callbacks",
      { type: "blob.upload-completed", payload: { blob: {} } },
    ],
    ["without payload", { type: "blob.generate-client-token" }],
  ])("rejects a body %s", async (_label, body) => {
    const res = await upload(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "validation", retryable: false },
    });
  });
});
