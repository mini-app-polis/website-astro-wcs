import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

const isNotesRoute = createRouteMatcher(["/notes", "/notes/(.*)"]);

export const onRequest = clerkMiddleware((auth, context) => {
  // Let non-notes routes pass through freely
  if (!isNotesRoute(context.request)) return;

  // Notes routes: auth is checked in the page itself
  // Middleware just ensures Clerk session data is available
});