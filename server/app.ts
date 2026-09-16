import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppDeps } from "./deps.js";
import { errorBody, HttpError } from "./http/errors.js";
import { meetingsRoutes } from "./routes/meetings.js";
import { uploadRoutes } from "./routes/upload.js";

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        errorBody(err.code, err.message, err.retryable),
        err.status,
      );
    }
    if (err instanceof HTTPException) {
      return c.json(errorBody("bad_request", err.message, false), err.status);
    }
    deps.log({
      level: "error",
      msg: "unhandled error",
      path: c.req.path,
      error: err.message,
      stack: err.stack,
    });
    return c.json(errorBody("internal", "Something went wrong", true), 500);
  });

  app.notFound((c) => c.json(errorBody("not_found", "Not found", false), 404));

  app.get("/health", (c) => c.json({ ok: true, sttProvider: deps.stt.name }));
  app.route("/meetings", meetingsRoutes(deps));
  app.route("/upload", uploadRoutes());

  return app;
}
