import { zValidator } from "@hono/zod-validator";
import { handleUpload } from "@vercel/blob/client";
import { Hono } from "hono";
import { z } from "zod";
import {
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  RECORDING_PATHNAME,
} from "../../shared/constants.js";
import { HttpError, validationHook } from "../http/errors.js";

// Token requests only: without onUploadCompleted there is no completion callback to verify.
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
          // The token is the only gate on direct uploads, so path, type and size are checked here.
          onBeforeGenerateToken: async (pathname) => {
            if (!RECORDING_PATHNAME.test(pathname)) {
              throw new HttpError(
                400,
                "bad_pathname",
                "Uploads must go to recordings/",
                false,
              );
            }
            return {
              allowedContentTypes: [...ALLOWED_AUDIO_TYPES],
              maximumSizeInBytes: MAX_AUDIO_BYTES,
              addRandomSuffix: false,
            };
          },
        }),
      ),
  );
}
