import { handleUpload } from "@vercel/blob/client";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { postJson } from "../test/requests.js";
import { testDeps } from "../test/testDeps.js";

// Echoes the policy back as the "token" so tests can see what was approved.
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

  it("issues a client token restricted to audio", async () => {
    const res = await postJson(
      app,
      "/api/upload",
      tokenRequest("recordings/a.webm"),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; clientToken: string };
    expect(body.type).toBe("blob.generate-client-token");
    expect(JSON.parse(body.clientToken)).toMatchObject({
      allowedContentTypes: expect.arrayContaining(["audio/webm"]),
      addRandomSuffix: false,
    });
  });

  it("passes the raw request and body to handleUpload", async () => {
    await postJson(app, "/api/upload", tokenRequest("recordings/b.m4a"));

    expect(vi.mocked(handleUpload)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: tokenRequest("recordings/b.m4a"),
        request: expect.any(Request),
      }),
    );
  });

  it("fills in optional payload fields the client may omit", async () => {
    const res = await postJson(app, "/api/upload", {
      type: "blob.generate-client-token",
      payload: { pathname: "recordings/c.webm" },
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(handleUpload)).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: tokenRequest("recordings/c.webm") }),
    );
  });

  it("rejects pathnames outside recordings/ with the error envelope", async () => {
    const res = await postJson(app, "/api/upload", tokenRequest("evil/a.webm"));

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
    const res = await postJson(app, "/api/upload", body);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "validation", retryable: false },
    });
  });
});
