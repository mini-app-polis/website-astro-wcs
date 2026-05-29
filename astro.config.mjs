import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";
import clerk from "@clerk/astro";
import preact from "@astrojs/preact";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  redirects: {
    "/book-now": "/booking/lessons",
  },
  integrations: [clerk(), tailwind(), preact()],
  vite: {
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