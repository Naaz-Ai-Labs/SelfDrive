import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Pumpkin Spice Season — warm autumn / rustic luxury palette.
           500 = Burnt Orange (primary/CTA), 600 = Chestnut Brown (secondary/hover),
           800 = Olive Brown (headings/overlays), 950 = Dark Espresso (dark sections). */
        brand: {
          50: "#fbeee0",
          100: "#f6d7b8",
          200: "#efba85",
          300: "#e3974e",
          400: "#d37726",
          500: "#be5103",
          600: "#8c4c1f",
          700: "#6b3a18",
          800: "#544823",
          900: "#423212",
          950: "#332216",
        },
        ink: {
          50: "#f9f5ef",
          100: "#f0e6d6",
          200: "#e0cbac",
          300: "#cbaa7e",
          400: "#ac8558",
          500: "#8a6740",
          600: "#6b4f31",
          700: "#513c26",
          800: "#3f2e1d",
          900: "#332216",
          950: "#241811",
        },
        gold: {
          300: "#e3974e",
          400: "#d37726",
          500: "#be5103",
          600: "#8c4c1f",
          700: "#6b3a18",
        },
        /* Earthy accent duo used alongside brand orange for decorative
           geometric shapes — rust and olive instead of the old red/blue triad. */
        bred: {
          500: "#a8451f",
          600: "#8c3818",
        },
        bblue: {
          500: "#544823",
          600: "#423712",
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
