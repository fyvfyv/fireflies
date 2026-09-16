import { extensionFor } from "@shared/constants";
import { upload } from "@vercel/blob/client";

export type UploadedAudio = {
  pathname: string;
  sizeBytes: number;
  contentType: string;
};

// Direct to Blob: Vercel Functions cap request bodies at 4.5 MB.
export async function uploadAudio(
  blob: Blob,
  contentType: string,
): Promise<UploadedAudio> {
  const pathname = `recordings/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  const result = await upload(pathname, blob, {
    access: "private",
    handleUploadUrl: "/api/upload",
    contentType,
  });
  return { pathname: result.pathname, sizeBytes: blob.size, contentType };
}
