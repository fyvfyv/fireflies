import { extensionFor } from "@shared/constants";
import { upload } from "@vercel/blob/client";

export type UploadedAudio = {
  pathname: string;
  sizeBytes: number;
  contentType: string;
};

// Uploads straight to the private Blob store: Vercel Functions cap request
// bodies at 4.5 MB, so audio never passes through the API.
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
