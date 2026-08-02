import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f2b705",
          600: "#d19b02",
          700: "#a67903",
          800: "#7a5a08",
          900: "#4a3708",
          950: "#2a1f04",
        },
        ink: {
          50: "#f7f7f8",
          100: "#ececee",
          200: "#d7d8db",
          300: "#b3b5bb",
          400: "#84868f",
          500: "#5c5e68",
          600: "#42434c",
          700: "#2f3038",
          800: "#1c1d22",
          900: "#0f0f13",
          950: "#08080a",
        },
        gold: {
          300: "#fde68a",
          400: "#fbbf24",
          500: "#f2b705",
          600: "#d19b02",
          700: "#a67903",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 30px rgba(13,26,43,0.08)",
        lift: "0 16px 40px rgba(13,26,43,0.16)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
