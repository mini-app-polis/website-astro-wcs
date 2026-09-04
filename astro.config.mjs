import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import clerk from "@clerk/astro";
import preact from "@astrojs/preact";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  redirects: {
    "/book-now": "/booking/lessons",
  },
  integrations: [clerk(), preact()],
  vite: {
    // @astrojs/tailwind is abandoned (5.1.5 peers astro ^3||^4||^5).
    // Tailwind ships its own Vite plugin now.
    plugins: [tailwindcss()],
    ssr: {
      external: [
        "node:fs",
        "node:path",
        "node:crypto",
        "node:buffer",
        "node:async_hooks",
        "fs",
        "path",
        "crypto",
        "buffer",
        "async_hooks",
      ],
    },
  },
});