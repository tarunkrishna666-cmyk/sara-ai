import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        tablet: "768px",
        laptop: "1024px",
        desktop: "1440px",
        wide: "1920px",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        sara: {
          base: "#0b1326",
          deep: "#060e20",
          panel: "#131b2e",
          raised: "#171f33",
          high: "#222a3d",
          line: "#ffffff14",
          text: "#dae2fd",
          muted: "#c7c4d7",
          primary: "#6366f1",
          violet: "#8b5cf6",
          cyan: "#67e8f9",
          emerald: "#34d399",
          amber: "#fbbf24",
          rose: "#fb7185"
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(99, 102, 241, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
