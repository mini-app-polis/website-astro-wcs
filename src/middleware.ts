import { defineMiddleware } from "astro/middleware";

/**
 * No-op middleware. Clerk session is verified in `src/lib/auth.ts` via
 * `verifyToken` + `__session` cookie; `clerkMiddleware()` was causing 500s on
 * Cloudflare Workers.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  return next();
});
