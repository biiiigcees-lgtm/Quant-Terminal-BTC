import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0d1117",
          bgSecondary: "#161b22",
          bgTertiary: "#21262d",
          border: "#30363d",
          borderSecondary: "#21262d",
          fg: "#e6edf3",
          fgSecondary: "#8b949e",
          fgMuted: "#6e7681",
          accent: "#58a6ff",
          accentHover: "#79b8ff",
          success: "#3fb950",
          warning: "#d29922",
          error: "#f85149",
          purple: "#a371f7",
          orange: "#f0883e",
          pink: "#ff7b72",
        },
        chart: {
          grid: "#21262d",
          bullish: "#3fb950",
          bearish: "#f85149",
          volume: "#30363d",
          crosshair: "#30363d",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "terminal-sm": ["11px", { lineHeight: "1.4", letterSpacing: "0.02em" }],
        "terminal-base": ["13px", { lineHeight: "1.5", letterSpacing: "0.01em" }],
        "terminal-lg": ["14px", { lineHeight: "1.5", letterSpacing: "0.01em" }],
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "slide-up": "slideUp 200ms ease-out",
        "slide-down": "slideDown 200ms ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "blink": "blink 1s step-end infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      boxShadow: {
        "terminal": "0 0 0 1px #30363d, 0 8px 24px rgba(0, 0, 0, 0.4)",
        "terminal-hover": "0 0 0 1px #484f58, 0 12px 32px rgba(0, 0, 0, 0.5)",
        "panel": "0 0 0 1px #21262d, 0 4px 16px rgba(0, 0, 0, 0.3)",
        "glow-accent": "0 0 20px rgba(88, 166, 255, 0.15)",
        "glow-success": "0 0 20px rgba(63, 185, 80, 0.15)",
        "glow-error": "0 0 20px rgba(248, 81, 73, 0.15)",
      },
      borderRadius: {
        "terminal": "6px",
        "panel": "8px",
      },
      transitionTimingFunction: {
        "terminal": "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        "fast": "100ms",
        "normal": "150ms",
        "slow": "200ms",
      },
    },
  },
  plugins: [],
};

export default config;