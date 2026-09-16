import { createMiddleware } from "hono/factory";
import type { AppDeps } from "../deps.js";
import { clientIpHash } from "../http/clientIp.js";
import { errorBody } from "../http/errors.js";

const WINDOW_MS = 60 * 60 * 1000;

// Counts rows the caller already created instead of keeping a counter table.
// Retry-After is the whole window: the repo only counts, so it can't tell when
// the oldest counted create expires.
export function rateLimit({
  repo,
  now,
  limits,
}: Pick<AppDeps, "repo" | "now" | "limits">) {
  return createMiddleware(async (c, next) => {
    const since = new Date(now().getTime() - WINDOW_MS);
    const ipHash = clientIpHash(c.req.header("x-forwarded-for"));
    const [fromIp, total] = await Promise.all([
      repo.countCreatedSince(since, ipHash),
      repo.countCreatedSince(since),
    ]);
    if (fromIp >= limits.perIpPerHour || total >= limits.globalPerHour) {
      return c.json(
        errorBody(
          "rate_limited",
          "Too many recordings in the last hour. Please try again later.",
          true,
        ),
        429,
        { "Retry-After": String(WINDOW_MS / 1000) },
      );
    }
    await next();
  });
}
