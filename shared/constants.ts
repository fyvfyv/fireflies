// Whisper (gateway and Groq) rejects uploads over 25 MB.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// At AUDIO_BITRATE an hour is ~14 MB, comfortably under MAX_AUDIO_BYTES.
export const MAX_RECORDING_MS = 60 * 60 * 1000;
export const RECORDING_WARN_MS = 55 * 60 * 1000;
export const AUDIO_BITRATE = 32_000;

// Slightly longer than the 300 s function limit, so a live run is never taken over.
export const LEASE_MS = 310_000;
export const MAX_ATTEMPTS = 5;
export const MIN_TRANSCRIPT_WORDS = 5;

const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
} as const;

type AllowedAudioType = keyof typeof AUDIO_EXTENSIONS;

export const ALLOWED_AUDIO_TYPES = Object.keys(
  AUDIO_EXTENSIONS,
) as AllowedAudioType[];

// One flat file under recordings/, matching what the client upload generates.
// Anything looser would let a meeting point at (and delete) any blob in the store.
export const RECORDING_PATHNAME = /^recordings\/[\w-]{1,100}\.[a-z0-9]{1,10}$/;

// MediaRecorder reports types with codec parameters, e.g. "audio/webm;codecs=opus".
export function baseType(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedAudioType(mime: string): boolean {
  return Object.hasOwn(AUDIO_EXTENSIONS, baseType(mime));
}

export function extensionFor(mime: string): string {
  const base = baseType(mime);
  if (!Object.hasOwn(AUDIO_EXTENSIONS, base)) {
    throw new Error(`Unsupported audio type: ${mime}`);
  }
  return AUDIO_EXTENSIONS[base as AllowedAudioType];
}
