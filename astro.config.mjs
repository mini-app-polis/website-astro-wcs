import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";
import clerk from "@clerk/astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [clerk(), tailwind()],
});