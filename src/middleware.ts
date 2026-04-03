import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

const isNotesRoute = createRouteMatcher(["/notes", "/notes/(.*)"]);

export const onRequest = clerkMiddleware((auth, context) => {
  if (!isNotesRoute(context.request)) return;
});
