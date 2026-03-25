/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#ffb020",
        pink: "#dd4462",
        surface: "#0f121a",
        surface2: "#0b0c0f",
      },
      fontFamily: {
        display: ["Oxanium", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 40px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};
