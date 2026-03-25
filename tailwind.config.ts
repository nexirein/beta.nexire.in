import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ─── Nexire Section 5 Design System ─────────────────────────────────
        background:      "var(--background)",
        surface:         "var(--surface)",
        "surface-2":     "var(--surface-raised)",
        "surface-sidebar":"var(--surface-sidebar)",
        border:          "var(--border)",
        foreground:      "var(--foreground)",
        muted:           "var(--muted)",
        success:         "var(--success)",
        warning:         "var(--warning)",
        destructive:     "var(--error)",

        // ─── Primary — uses CSS vars so theme switches live ─────────────────
        primary: {
          DEFAULT: "var(--primary)",
          dark:    "var(--primary-dark)",
          light:   "var(--primary-light)",
          lighter: "var(--primary-lighter, #B8CFFF)",
        },

        // ─── Score tiers ──────────────────────────────────────────────────────
        score: {
          high: "var(--score-high)",
          mid:  "var(--score-mid)",
          low:  "var(--score-low)",
        },

        // ─── Semantic text tokens ─────────────────────────────────────────────
        "text-primary":   "var(--foreground)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary":  "var(--muted)",
        "text-disabled":  "var(--text-disabled)",
        accent:           "var(--primary)",
        "accent-light":   "var(--primary-light)",
        info:             "var(--primary)",

        // ─── Brand tokens — MUST use CSS vars so theme switcher works live ────
        brand: {
          50:   "var(--brand-50)",
          100:  "var(--brand-100)",
          200:  "var(--brand-200)",
          300:  "var(--brand-300)",
          400:  "var(--primary-light)",
          500:  "var(--primary)",
          600:  "var(--primary-dark)",
          glow: "var(--primary-glow)",
          tint: "var(--primary-tint)",
        },

        // ─── brand-purple alias (legacy) ─────────────────────────────────────
        "brand-purple":   "var(--primary)",
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "'JetBrains Mono'", "monospace"],
      },

      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },

      borderRadius: {
        DEFAULT: "8px",
        lg:     "12px",
        xl:     "16px",
        "2xl":  "20px",
        pill:   "9999px",
      },

      boxShadow: {
        card:  "0 4px 40px rgba(0,0,0,0.03), 0 1px 3px rgba(76,109,253,0.08)",
        float: "0 8px 32px rgba(76,109,253,0.12)",
        glow:  "0 0 20px rgba(76,109,253,0.5)",
        sm:    "0 1px 3px rgba(76,109,253,0.08)",
      },

      animation: {
        "fade-in":       "fadeIn 0.25s ease-out both",
        "slide-up":      "slideUp 0.3s ease-out both",
        "slide-in-left": "slideInLeft 0.25s ease-out both",
        "scale-in":      "scaleIn 0.2s ease-out both",
        "pulse-soft":    "pulseSoft 2s ease-in-out infinite",
        "shimmer":       "shimmer 1.5s infinite",
      },

      keyframes: {
        fadeIn:       { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:      { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideInLeft:  { "0%": { opacity: "0", transform: "translateX(-12px)" }, "100%": { opacity: "1", transform: "translateX(0)" } },
        scaleIn:      { "0%": { opacity: "0", transform: "scale(0.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        pulseSoft:    { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.65" } },
        shimmer:      { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
      },
    },
  },
  plugins: [],
};

export default config;
