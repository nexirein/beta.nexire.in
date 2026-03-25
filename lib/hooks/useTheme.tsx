"use client";

/**
 * lib/hooks/useTheme.tsx
 * Global theme system for Nexire — 6 theme presets.
 * Stores selection in localStorage and injects CSS vars into :root instantly.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeId = "nexire" | "ocean" | "forest" | "sunset" | "midnight" | "rose";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  emoji: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryGlow: string;
  primaryTint: string;
  description: string;
  preview: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: "nexire",
    name: "Nexire Blue",
    emoji: "💙",
    primary: "#4C6DFD",
    primaryDark: "#3A56E8",
    primaryLight: "#7B9FFF",
    primaryGlow: "rgba(76, 109, 253, 0.20)",
    primaryTint: "rgba(76, 109, 253, 0.08)",
    description: "The default Nexire brand colour",
    preview: "linear-gradient(135deg, #4C6DFD, #7B9FFF)",
  },
  {
    id: "ocean",
    name: "Ocean",
    emoji: "🌊",
    primary: "#0EA5E9",
    primaryDark: "#0284C7",
    primaryLight: "#38BDF8",
    primaryGlow: "rgba(14, 165, 233, 0.20)",
    primaryTint: "rgba(14, 165, 233, 0.08)",
    description: "Deep sky blue — clean and professional",
    preview: "linear-gradient(135deg, #0EA5E9, #38BDF8)",
  },
  {
    id: "forest",
    name: "Forest",
    emoji: "🌿",
    primary: "#10B981",
    primaryDark: "#059669",
    primaryLight: "#34D399",
    primaryGlow: "rgba(16, 185, 129, 0.20)",
    primaryTint: "rgba(16, 185, 129, 0.08)",
    description: "Calm green — refreshing and growth-oriented",
    preview: "linear-gradient(135deg, #10B981, #34D399)",
  },
  {
    id: "sunset",
    name: "Sunset",
    emoji: "🌅",
    primary: "#F59E0B",
    primaryDark: "#D97706",
    primaryLight: "#FCD34D",
    primaryGlow: "rgba(245, 158, 11, 0.20)",
    primaryTint: "rgba(245, 158, 11, 0.08)",
    description: "Warm amber — energetic and inviting",
    preview: "linear-gradient(135deg, #F59E0B, #FCD34D)",
  },
  {
    id: "midnight",
    name: "Midnight Purple",
    emoji: "🌙",
    primary: "#8B5CF6",
    primaryDark: "#7C3AED",
    primaryLight: "#A78BFA",
    primaryGlow: "rgba(139, 92, 246, 0.20)",
    primaryTint: "rgba(139, 92, 246, 0.08)",
    description: "Rich purple — creative and bold",
    preview: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
  },
  {
    id: "rose",
    name: "Rose",
    emoji: "🌸",
    primary: "#F43F5E",
    primaryDark: "#E11D48",
    primaryLight: "#FB7185",
    primaryGlow: "rgba(244, 63, 94, 0.20)",
    primaryTint: "rgba(244, 63, 94, 0.08)",
    description: "Vibrant rose — confident and modern",
    preview: "linear-gradient(135deg, #F43F5E, #FB7185)",
  },
];

interface ThemeContextValue {
  theme: ThemeConfig;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>("nexire");

  useEffect(() => {
    const saved = localStorage.getItem("nexire-theme") as ThemeId | null;
    if (saved && THEMES.find((t) => t.id === saved)) {
      setThemeId(saved);
    }
  }, []);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  // Inject the full design token set whenever theme changes
  useEffect(() => {
    const root = document.documentElement;

    // Helper: extract RGB components from a hex color for rgba() usage
    const hexToRgb = (hex: string) => {
      const m = hex.replace("#", "").match(/.{2}/g);
      if (!m) return "76, 109, 253";
      return `${parseInt(m[0], 16)}, ${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}`;
    };

    const rgb = hexToRgb(theme.primary);

    // Primary brand track
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--primary-dark", theme.primaryDark);
    root.style.setProperty("--primary-light", theme.primaryLight);
    root.style.setProperty("--primary-lighter", theme.primaryLight + "80");
    root.style.setProperty("--primary-glow", `rgba(${rgb}, 0.20)`);
    root.style.setProperty("--primary-tint", `rgba(${rgb}, 0.08)`);

    // Brand tint scale (used by Tailwind brand-50 through brand-300)
    root.style.setProperty("--brand-50",  `rgba(${rgb}, 0.04)`);
    root.style.setProperty("--brand-100", `rgba(${rgb}, 0.10)`);
    root.style.setProperty("--brand-200", `rgba(${rgb}, 0.16)`);
    root.style.setProperty("--brand-300", `rgba(${rgb}, 0.25)`);

    // Gradient tokens
    root.style.setProperty("--gradient-primary", `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryLight} 100%)`);
    root.style.setProperty("--gradient-hero",    `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryLight} 100%)`);

    // Border/shadow aliases that reference primary
    root.style.setProperty("--border-subtle", `rgba(${rgb}, 0.12)`);
    root.style.setProperty("--border-focus",  `rgba(${rgb}, 0.50)`);
    root.style.setProperty("--shadow-card",   `0 4px 40px rgba(0,0,0,0.03), 0 1px 3px rgba(${rgb}, 0.08)`);
    root.style.setProperty("--shadow-float",  `0 8px 32px rgba(${rgb}, 0.12)`);
    root.style.setProperty("--shadow-glow",   `0 0 20px rgba(${rgb}, 0.50)`);
    root.style.setProperty("--shadow-sm",     `0 1px 3px rgba(${rgb}, 0.08)`);

    // Info color alias
    root.style.setProperty("--info", theme.primary);

    // Persist selection
    localStorage.setItem("nexire-theme", theme.id);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
