import { defineMiddleware } from "astro/middleware";
import { createClerkClient } from "@clerk/backend";

/**
 * Clerk handshake middleware.
 *
 * Clerk session JWTs (in the `__session` cookie) are short-lived (~60s). On
 * the very first SSR request after the cookie has gone stale, server-side
 * `verifyToken` fails, our auth helpers return `userId = null`, and pages
 * render as if the user were signed out — which is why the Admin menu used
 * to only appear after a hard reload.
 *
 * This middleware uses `@clerk/backend`'s `authenticateRequest` to detect
 * that exact case. When Clerk reports `status === "handshake"`, it returns
 * a 307 response with the Set-Cookie / Location headers Clerk needs to
 * refresh the session cookie and bounce back to the original URL. By the
 * time our page frontmatter runs, the cookie holds a fresh JWT and SSR
 * auth succeeds.
 *
 * Everything is wrapped in try/catch and falls through to `next()` on any
 * error so a Clerk hiccup can never take the site down — the worst case
 * degrades to the previous behaviour and the client-side reveal in Nav.astro
 * still kicks in.
 *
 * Previous note: `clerkMiddleware()` from `@clerk/astro/server` was causing
 * 500s on Cloudflare Workers with `@clerk/astro` v3. We use `@clerk/backend`
 * directly here instead, which is a thinner, more predictable primitive.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const env = (context.locals as { runtime?: { env?: Record<string, string> } })
      .runtime?.env;

    const secretKey =
      env?.CLERK_SECRET_KEY ?? import.meta.env.CLERK_SECRET_KEY;
    const publishableKey =
      env?.PUBLIC_CLERK_PUBLISHABLE_KEY ??
      import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
    const rawJwtKey = env?.CLERK_JWT_KEY ?? import.meta.env.CLERK_JWT_KEY;
    const jwtKey = rawJwtKey?.replace(/\\n/g, "\n");

    // Without these keys we can't authenticate at all; let the request through
    // so the rest of the app behaves exactly like before.
    if (!secretKey || !publishableKey) {
      return next();
    }

    const clerkClient = createClerkClient({
      secretKey,
      publishableKey,
      jwtKey,
    });

    const requestState = await clerkClient.authenticateRequest(
      context.request,
      {
        authorizedParties: ["https://wcs.kaianolevine.com"],
      },
    );

    // Clerk asks us to perform a handshake (refresh the session cookie) when
    // the client *claims* to be signed in but the server-side session token
    // is missing or expired. `requestState.headers` already has the
    // Set-Cookie + Location values we need to bounce the browser.
    if (requestState.status === "handshake") {
      return new Response(null, {
        status: 307,
        headers: requestState.headers,
      });
    }
  } catch (err) {
    // Never take the page down for an auth glitch. The client-side reveal in
    // Nav.astro is the safety net for the worst case.
    console.error("[middleware] clerk handshake error:", err);
  }

  return next();
});
