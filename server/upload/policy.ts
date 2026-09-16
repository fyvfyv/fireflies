import {
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  RECORDING_PATHNAME,
} from "../../shared/constants.js";
import { HttpError } from "../http/errors.js";

// The Blob token is the only gate on direct uploads, so type and size are enforced here.
export function uploadPolicy(pathname: string) {
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
}
