import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Class strings kept outside the component folders (categories.ts, uiClasses.ts)
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Theme tokens (globals.css) — light and dark values swap on <html data-theme>
        app: "var(--color-app)",
        surface: "var(--color-surface)",
        line: "var(--color-line)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        "accent-ink": "var(--color-accent-ink)",
        "accent-text": "var(--color-accent-text)",
        chip: "var(--color-chip)",
        "line-strong": "var(--color-line-strong)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        control: "var(--color-control)",
        "ball-tag": "var(--color-ball-tag)",
      },
    },
  },
  plugins: [],
};
export default config;
