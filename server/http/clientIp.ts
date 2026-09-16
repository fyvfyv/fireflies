import { createHash } from "node:crypto";

// Vercel sets x-forwarded-for to the real client IP. Only a hash is stored:
// enough to count creates per client without keeping addresses.
export function clientIpHash(forwardedFor: string | undefined): string {
  const ip = forwardedFor?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(ip).digest("hex");
}
