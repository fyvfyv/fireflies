export type StoredAudio = { bytes: Uint8Array; contentType: string };

export type Storage = {
  readAudio(pathname: string): Promise<StoredAudio>;
  delete(pathname: string): Promise<void>;
};
