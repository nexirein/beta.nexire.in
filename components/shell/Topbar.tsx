"use client";

/**
 * components/shell/Topbar.tsx
 * Light-mode topbar — matches Section 5 design system.
 * Removed dark bg (#0A0A0A). Now white, brand-blue accents.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Palette, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/useUser";
import { formatCredits, getInitials } from "@/lib/utils";
import { useSearchStore } from "@/lib/store/search-store";

interface TopbarProps {
  breadcrumb?: Array<{ label: string; href?: string }>;
  onNewSearch?: () => void;
}

export function Topbar({ breadcrumb, onNewSearch }: TopbarProps) {
  const { profile, org } = useUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { lastCreditsUsed, projectId } = useSearchStore();

  function handleLogout() {
    const supabase = createClient();
    supabase.auth.signOut().then(() => {
      router.push("/login");
      router.refresh();
    });
  }

  function handleNewSearch() {
    if (onNewSearch) {
      onNewSearch();
      return;
    }
    // Default behavior: fresh navigate to /search with current project context
    const url = projectId ? `/search?project_id=${projectId}&t=${Date.now()}` : `/search?t=${Date.now()}`;
    window.location.href = url;
  }

  const initials = getInitials(profile?.full_name);
  const credits = org?.credits_balance ?? 0;

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumb && breadcrumb.length > 0 ? (
          breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              {crumb.href ? (
                <a href={crumb.href} className="text-gray-400 transition-colors hover:text-text-primary">
                  {crumb.label}
                </a>
              ) : (
                <span className={i === breadcrumb.length - 1 ? "font-semibold text-text-primary" : "text-gray-400"}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))
        ) : (
          <span className="font-semibold text-text-primary">Dashboard</span>
        )}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-3">

        {/* Theme — opens settings */}
        <a
          href="/settings"
          title="Theme Settings"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-text-tertiary transition-colors hover:border-brand-300 hover:text-brand-500"
        >
          <Palette className="h-4 w-4" />
        </a>

        {/* New Search */}
        <button
          onClick={handleNewSearch}
          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          New Search
        </button>

        {/* Credits badge */}
        {org && (
          <div className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1">
            <Zap className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs font-semibold text-brand-600">
              Balance {formatCredits(credits)} credits available
            </span>
          </div>
        )}

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600 ring-2 ring-transparent transition-all hover:ring-brand-200"
            aria-label="User menu"
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={initials} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              initials
            )}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-56 rounded-2xl border border-gray-200 bg-white p-1 shadow-xl shadow-gray-200/80 animate-fade-in">
                <div className="px-3 py-2 mb-1">
                  <p className="text-sm font-medium text-text-primary truncate">{profile?.full_name ?? "User"}</p>
                  <p className="text-xs text-text-tertiary truncate">{org?.name}</p>
                </div>
                <div className="h-px bg-gray-100 mb-1" />
                <a href="/settings/profile" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors" onClick={() => setMenuOpen(false)}>
                  Profile &amp; Settings
                </a>
                <a href="/settings" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors" onClick={() => setMenuOpen(false)}>
                  Theme &amp; Appearance
                </a>
                <a href="/billing" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors" onClick={() => setMenuOpen(false)}>
                  Billing &amp; Credits
                </a>
                <div className="h-px bg-gray-100 my-1" />
                <button onClick={handleLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
