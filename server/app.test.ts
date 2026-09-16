import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { HttpError } from "./http/errors.js";
import { testDeps } from "./test/testDeps.js";

function appThrowing(error: Error, log = vi.fn()) {
  const app = createApp(testDeps({ log }));
  app.get("/boom", () => {
    throw error;
  });
  return app;
}

describe("createApp", () => {
  it("answers the health check with the STT provider", async () => {
    const res = await createApp(testDeps()).request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sttProvider: "stub:stt" });
  });

  it("returns the error envelope for unknown routes", async () => {
    const res = await createApp(testDeps()).request("/api/nope");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });

  it("maps HttpError to its status and envelope", async () => {
    const res = await appThrowing(
      new HttpError(409, "already_processing", "Busy", true),
    ).request("/api/boom");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "already_processing", message: "Busy", retryable: true },
    });
  });

  it("maps Hono exceptions to a non-retryable client error", async () => {
    const res = await appThrowing(
      new HTTPException(400, { message: "Malformed JSON in request body" }),
    ).request("/api/boom");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "bad_request", retryable: false },
    });
  });

  it("hides unexpected errors behind a logged 500", async () => {
    const log = vi.fn();
    const res = await appThrowing(new Error("db password leaked"), log).request(
      "/api/boom",
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "internal" } });
    expect(JSON.stringify(body)).not.toContain("password");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", error: "db password leaked" }),
    );
  });
});
