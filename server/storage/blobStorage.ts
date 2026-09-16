import { del, get } from "@vercel/blob";
import { HttpError } from "../http/errors.js";
import type { Storage } from "./types.js";

export function blobStorage(): Storage {
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

    // Callers treat deletion as best effort and log failures themselves.
    delete: (pathname) => del(pathname),
  };
}
