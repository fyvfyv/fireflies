import { createHash } from "node:crypto";

// Vercel sets x-forwarded-for; only a hash is stored so client addresses are never kept.
export function clientIpHash(forwardedFor: string | undefined): string {
  const ip = forwardedFor?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(ip).digest("hex");
}
