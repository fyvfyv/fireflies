import { zValidator } from "@hono/zod-validator";
import { handleUpload } from "@vercel/blob/client";
import { Hono } from "hono";
import { z } from "zod";
import { validationHook } from "../http/errors.js";
import { uploadPolicy } from "../upload/policy.js";

// Only token requests are accepted: without onUploadCompleted there is no
// completion callback to verify, so anything else is a malformed request.
const tokenRequestSchema = z.object({
  type: z.literal("blob.generate-client-token"),
  payload: z.object({
    pathname: z.string(),
    clientPayload: z.string().nullable().default(null),
    multipart: z.boolean().default(false),
  }),
});

export function uploadRoutes() {
  return new Hono().post(
    "/",
    zValidator("json", tokenRequestSchema, validationHook),
    async (c) =>
      c.json(
        await handleUpload({
          body: c.req.valid("json"),
          request: c.req.raw,
          onBeforeGenerateToken: async (pathname) => uploadPolicy(pathname),
        }),
      ),
  );
}
