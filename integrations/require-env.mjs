import { loadEnv } from "vite";

/**
 * Stops `astro build` when a variable the site cannot work without is unset.
 *
 * These values are baked into the static output at build time. A build
 * without one succeeds and deploys a page that fails only in the browser;
 * stopping here leaves the last good deploy serving instead. `astro dev`
 * runs without them, for local work.
 *
 * @param {string[]} names the variables a production build requires
 * @returns {import("astro").AstroIntegration}
 */
export default function requireEnv(names) {
  return {
    name: "require-env",
    hooks: {
      "astro:config:setup": ({ command }) => {
        if (command !== "build") return;
        const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
        const missing = names.filter((name) => !env[name]?.trim());
        if (missing.length > 0) {
          throw new Error(
            `Build stopped: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unset. ` +
              "Every production build needs them; see .env.example.",
          );
        }
      },
    },
  };
}
