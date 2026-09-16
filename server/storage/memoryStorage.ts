import { HttpError } from "../http/errors.js";
import { AUDIO_URL_TTL_MS, type Storage, type StoredAudio } from "./types.js";

export type MemoryStorage = Storage & {
  put(pathname: string, audio: StoredAudio): void;
};

const audioMissing = () =>
  new HttpError(404, "audio_missing", "Audio not found", false);

export function memoryStorage(
  now: () => Date = () => new Date(),
): MemoryStorage {
  const files = new Map<string, StoredAudio>();

  return {
    put(pathname, audio) {
      files.set(pathname, audio);
    },

    async readAudio(pathname) {
      const audio = files.get(pathname);
      if (!audio) throw audioMissing();
      return audio;
    },

    async audioUrl(pathname) {
      if (!files.has(pathname)) throw audioMissing();
      return {
        url: `https://memory.test/${pathname}`,
        expiresAt: new Date(now().getTime() + AUDIO_URL_TTL_MS).toISOString(),
      };
    },

    async delete(pathname) {
      files.delete(pathname);
    },
  };
}
