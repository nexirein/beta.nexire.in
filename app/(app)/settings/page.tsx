"use client";

/**
 * app/(app)/settings/page.tsx
 * Theme & Appearance settings page
 */

import { useTheme, THEMES, type ThemeId } from "@/lib/hooks/useTheme";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { Check, Palette, Monitor, Type } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { prefs, updatePrefs, mounted } = usePreferences();

  // Prevent hydration mismatch for preferences if not mounted yet
  if (!mounted) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary text-sm mt-1">Customise your Nexire workspace appearance.</p>
      </div>

      {/* Theme Card */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-100 bg-white shadow-sm" style={{ background: theme.primary + "18" }}>
            <Palette className="w-4 h-4" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Accent Colour</h2>
            <p className="text-xs text-text-secondary">Changes buttons, links, chips and highlights across the entire app.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as ThemeId)}
              className={`relative flex flex-col items-start gap-2.5 p-4 rounded-xl border-2 text-left transition-all group ${
                theme.id === t.id
                  ? "border-transparent ring-2 shadow-md"
                  : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
              style={theme.id === t.id ? {
                borderColor: "transparent",
                boxShadow: `0 0 0 2px ${t.primary}, 0 4px 16px ${t.primaryGlow}`,
                background: t.primaryTint,
              } : {}}
            >
              <div
                className="w-full h-10 rounded-lg shadow-inner"
                style={{ background: t.preview }}
              />

              <div className="flex items-center justify-between w-full">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{t.emoji} {t.name}</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">{t.description}</p>
                </div>
                {theme.id === t.id && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: t.primary }}>
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Live preview */}
        <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: theme.primary, boxShadow: `0 4px 12px ${theme.primaryGlow}` }}
            >
              New Search
            </button>
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: theme.primaryTint, color: theme.primary }}
            >
              42 credits
            </span>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{ background: theme.primaryTint, color: theme.primary, borderColor: theme.primaryGlow }}
            >
              {theme.emoji} {theme.name}
            </span>
          </div>
        </div>
      </div>

      {/* Display Card */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200 shadow-sm">
            <Monitor className="w-4 h-4 text-text-secondary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Display</h2>
            <p className="text-xs text-text-secondary">Interface density and layout options.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-text-primary">Compact sidebar</p>
              <p className="text-xs text-text-secondary">Collapse sidebar by default to give more room to results.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                 type="checkbox"
                 className="sr-only peer"
                 checked={prefs.compactSidebar}
                 onChange={(e) => updatePrefs({ compactSidebar: e.target.checked })}
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                   style={{ backgroundColor: prefs.compactSidebar ? theme.primary : undefined }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-text-primary">Show quick-start prompts</p>
              <p className="text-xs text-text-secondary">Show role suggestions on the empty search screen.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                 type="checkbox"
                 className="sr-only peer"
                 checked={prefs.showQuickStartPrompts}
                 onChange={(e) => updatePrefs({ showQuickStartPrompts: e.target.checked })}
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                   style={{ backgroundColor: prefs.showQuickStartPrompts ? theme.primary : undefined }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Animate transitions</p>
              <p className="text-xs text-text-secondary">Enable smooth page and component animations.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                 type="checkbox"
                 className="sr-only peer"
                 checked={prefs.animateTransitions}
                 onChange={(e) => updatePrefs({ animateTransitions: e.target.checked })}
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                   style={{ backgroundColor: prefs.animateTransitions ? theme.primary : undefined }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Typography Card */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200 shadow-sm">
            <Type className="w-4 h-4 text-text-secondary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Typography</h2>
            <p className="text-xs text-text-secondary">Font size scaling across the application.</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(["Small", "Default", "Large"] as const).map((size) => (
            <button
              key={size}
              onClick={() => updatePrefs({ typographySize: size })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                prefs.typographySize === size
                  ? "border-transparent text-white"
                  : "border-gray-200 text-text-secondary hover:border-gray-300"
              }`}
              style={prefs.typographySize === size ? { background: theme.primary, boxShadow: `0 4px 12px ${theme.primaryGlow}` } : {}}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
