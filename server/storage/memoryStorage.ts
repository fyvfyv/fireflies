import { HttpError } from "../http/errors.js";
import type { Storage, StoredAudio } from "./types.js";

export type MemoryStorage = Storage & {
  put(pathname: string, audio: StoredAudio): void;
};

export function memoryStorage(): MemoryStorage {
  const files = new Map<string, StoredAudio>();

  return {
    put(pathname, audio) {
      files.set(pathname, audio);
    },

    async readAudio(pathname) {
      const audio = files.get(pathname);
      if (!audio) {
        throw new HttpError(404, "audio_missing", "Audio not found", false);
      }
      return audio;
    },

    async delete(pathname) {
      files.delete(pathname);
    },
  };
}
