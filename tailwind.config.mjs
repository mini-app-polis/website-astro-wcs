/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#34d399",
        surface: "#18181e",
        surface2: "#1f1f27",
        canvas: "#0d0d0f",
        canvas2: "#111115",
      },
      fontFamily: {
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 40px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
