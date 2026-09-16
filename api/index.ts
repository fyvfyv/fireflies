import { app } from "../server/index.js";

// @vercel/node treats a default export without `.fetch` as a legacy (req, res)
// handler, so export the Hono app itself rather than hono/vercel's handle(app).
export default app;
