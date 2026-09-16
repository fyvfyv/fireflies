import type { AudioUrl } from "../../shared/schemas.js";

export type StoredAudio = { bytes: Uint8Array; contentType: string };

// Long enough to play a one-hour recording without refreshing the URL.
export const AUDIO_URL_TTL_MS = 60 * 60 * 1000;

export type Storage = {
  readAudio(pathname: string): Promise<StoredAudio>;
  /** A short-lived URL the browser can stream the audio from directly. */
  audioUrl(pathname: string): Promise<AudioUrl>;
  delete(pathname: string): Promise<void>;
};
