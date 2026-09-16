import { del, get, issueSignedToken, presignUrl } from "@vercel/blob";
import { HttpError } from "../http/errors.js";
import { AUDIO_URL_TTL_MS, type Storage } from "./types.js";

export function blobStorage(now: () => Date = () => new Date()): Storage {
  return {
    async readAudio(pathname) {
      const r = await get(pathname, { access: "private" });
      if (r?.statusCode !== 200) {
        throw new HttpError(404, "audio_missing", "Audio not found", false);
      }
      return {
        bytes: new Uint8Array(await new Response(r.stream).arrayBuffer()),
        contentType: r.blob.contentType,
      };
    },

    // The token is scoped to this one blob and to reads, so a leaked URL
    // exposes nothing else in the store.
    async audioUrl(pathname) {
      const token = await issueSignedToken({
        pathname,
        operations: ["get"],
        validUntil: now().getTime() + AUDIO_URL_TTL_MS,
      });
      const { presignedUrl } = await presignUrl(token, {
        operation: "get",
        pathname,
        access: "private",
      });
      return {
        url: presignedUrl,
        expiresAt: new Date(token.validUntil).toISOString(),
      };
    },

    // Callers treat deletion as best effort and log failures themselves.
    delete: (pathname) => del(pathname),
  };
}
