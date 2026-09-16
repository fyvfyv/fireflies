import type { createApp } from "../app.js";

type TestApp = ReturnType<typeof createApp>;

export function postJson(
  app: TestApp,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export const validCreateBody = {
  audioPathname: "recordings/a.webm",
  contentType: "audio/webm",
  sizeBytes: 1024,
  source: "mic",
};
