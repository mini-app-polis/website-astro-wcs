import { defineMiddleware } from "astro/middleware";

/**
 * No-op middleware.
 *
 * Clerk session auth is handled manually in `src/lib/auth.ts` via
 * `verifyToken` + `__session` cookie extraction. `clerkMiddleware()` from
 * `@clerk/astro/server` was causing 500s on Cloudflare Workers with
 * `@clerk/astro` v3 — revisit if upgrading to v4+.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  return next();
});
