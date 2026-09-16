import { app } from "../server/index.js";

// @vercel/node treats a default export without `.fetch` as a legacy handler, so not handle(app).
export default app;
