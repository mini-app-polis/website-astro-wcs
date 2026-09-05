import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import clerk from "@clerk/astro";
import preact from "@astrojs/preact";

// Static. No adapter, no server runtime, no bindings — the same shape as the
// other three sites in the fleet.
//
// This site used to be output: "server" with @astrojs/cloudflare, because auth
// was enforced in page frontmatter. That is what chained hosting to the Astro
// version: the adapter's peer dependency decided which Astro major was
// installable, and v11 — the last release supporting Cloudflare Pages — pinned
// this site to Astro 4 and its advisories.
//
// Authorization now happens in one place, api.kaianolevine.com, which was
// already the only real gate: every /v1/wcs/* route is scope-guarded and the
// pages here only ever hid a shell. Nothing in src/ needs a request now, so
// nothing needs an adapter, and the Astro version is free to move.
//
// Clerk stays exactly as it was. It never required an adapter — output:
// "server" did. <SignIn>, <UserButton> and <Show> mount client-side either way.
export default defineConfig({
  site: "https://wcs.kaianolevine.com",
  output: "static",
  redirects: {
    "/book-now": "/booking/lessons",
  },
  integrations: [clerk(), preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
