"use client";

import { useState, useEffect } from "react";

export interface UserPreferences {
  compactSidebar: boolean;
  showQuickStartPrompts: boolean;
  animateTransitions: boolean;
  typographySize: "Small" | "Default" | "Large";
}

const DEFAULT_PREFS: UserPreferences = {
  compactSidebar: false,
  showQuickStartPrompts: true,
  animateTransitions: true,
  typographySize: "Default",
};

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("nexire-preferences");
    if (saved) {
      try {
        setPrefs(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse preferences", e);
      }
    }
    setMounted(true);
  }, []);

  const updatePrefs = (newPrefs: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const updated = { ...prev, ...newPrefs };
      localStorage.setItem("nexire-preferences", JSON.stringify(updated));
      return updated;
    });
  };

  // Optional: inject typography variable
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (prefs.typographySize === "Small") {
      root.style.fontSize = "14px";
    } else if (prefs.typographySize === "Large") {
      root.style.fontSize = "18px";
    } else {
      root.style.fontSize = "16px";
    }
  }, [prefs.typographySize, mounted]);

  return { prefs, updatePrefs, mounted };
}
