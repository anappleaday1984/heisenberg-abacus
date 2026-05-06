import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        entry: "#60a5fa",
        pm: "#a78bfa",
        persona: "#34d399",
        summary: "#fbbf24",
      },
    },
  },
  plugins: [],
};

export default config;
