<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/projects.md        ← this module's API contract
-->

M02 — TASK 01: APP SHELL (Sidebar + Layout + Navigation)
Trae: Read CLAUDE.md first. This is the MASTER layout for all app pages.
Every page inside the app (/projects, /search, /contacts, /sequences etc.)
uses this shell. Build it perfectly — it renders on every screen.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build the dark-mode app shell with:

Collapsible left sidebar (240px expanded / 64px icon-only collapsed)

Top header bar with search trigger, credits meter, and user avatar

⌘K command palette (cmdk)

Responsive mobile: sidebar becomes bottom sheet drawer

Credits counter animates when credits change

DESIGN SPEC
Background: #0A0A0A
Sidebar bg: #0D0D0D (slightly lighter than page)
Sidebar border-right: 1px solid #1A1A1A
Header bg: #0A0A0A / blur backdrop
Active nav item: bg-[#38BDF8]/10 text-[#38BDF8] border-l-2 border-[#38BDF8]
Inactive nav item: text-[#A0A0A0] hover:text-[#FAFAFA] hover:bg-[#111111]
Credits pill: bg-[#111111] border border-[#222222] — accent color when < 20 credits

FILE 1 — app/(app)/layout.tsx [CRITICAL — wraps all app pages]
tsx
import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, plan_tier, credits_balance, onboarding_done")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_done) redirect("/onboarding");

  return <AppShell profile={profile}>{children}</AppShell>;
}
FILE 2 — components/layout/AppShell.tsx
This is a Client Component that manages sidebar open/close state.

tsx
"use client";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  plan_tier: string;
  credits_balance: number;
  onboarding_done: boolean;
}

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        profile={profile}
      />

      {/* Main area */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
        )}
      >
        <Header
          profile={profile}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onCmdOpen={() => setCmdOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
FILE 3 — components/layout/Sidebar.tsx
Build the full sidebar with ALL navigation items:

tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen, Search, Users, Mail, Library,
  CreditCard, Settings, ChevronLeft, ChevronRight,
  Sparkles, LayoutDashboard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NexireLogo } from "@/components/ui/logo";

const NAV_ITEMS = [
  { href: "/projects",  label: "Projects",   icon: FolderOpen,      badge: null },
  { href: "/search",    label: "Search",      icon: Search,          badge: "AI" },
  { href: "/contacts",  label: "Contacts",    icon: Users,           badge: null },
  { href: "/sequences", label: "Sequences",   icon: Mail,            badge: null },
  { href: "/library",   label: "Library",     icon: Library,         badge: null },
];

const BOTTOM_ITEMS = [
  { href: "/billing",   label: "Billing",     icon: CreditCard },
  { href: "/settings",  label: "Settings",    icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  profile: { full_name: string | null; email: string | null; avatar_url: string | null; plan_tier: string; credits_balance: number };
}

export function Sidebar({ open, onToggle, profile }: SidebarProps) {
  const pathname = usePathname();
  const lowCredits = profile.credits_balance < 20;

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-[#0D0D0D] border-r border-[#1A1A1A] transition-all duration-200 flex-shrink-0",
        open ? "w-60" : "w-16"
      )}
    >
      {/* Logo area */}
      <div className={cn("flex items-center h-14 px-4 border-b border-[#1A1A1A]", !open && "justify-center px-0")}>
        {open ? (
          <NexireLogo variant="light" size="md" href="/projects" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative",
                active
                  ? "bg-[#38BDF8]/10 text-[#38BDF8]"
                  : "text-[#A0A0A0] hover:text-[#FAFAFA] hover:bg-[#111111]",
                !open && "justify-center px-0"
              )}
            >
              {/* Active indicator */}
              {active && open && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#38BDF8] rounded-r-full" />
              )}
              <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#38BDF8]" : "text-[#555555] group-hover:text-[#A0A0A0]")} />
              {open && <span className="truncate">{item.label}</span>}
              {open && item.badge && (
                <span className="ml-auto text-[10px] font-semibold bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white px-1.5 py-0.5 rounded-md">
                  {item.badge}
                </span>
              )}
              {/* Tooltip when collapsed */}
              {!open && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-[#1A1A1A] text-[#FAFAFA] text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-[#222222]">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Credits meter */}
      <div className="px-2 py-2">
        <div className={cn(
          "rounded-xl border px-3 py-2.5 transition-all",
          lowCredits
            ? "border-orange-500/30 bg-orange-500/5"
            : "border-[#222222] bg-[#111111]",
          !open && "flex justify-center items-center"
        )}>
          {open ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[#555555] font-medium">Credits</span>
                <Link href="/billing" className="text-[10px] text-[#38BDF8] hover:text-[#0EA5E9]">Top up</Link>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      lowCredits
                        ? "bg-gradient-to-r from-orange-400 to-orange-500"
                        : "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9]"
                    )}
                    style={{ width: `${Math.min(100, (profile.credits_balance / 200) * 100)}%` }}
                  />
                </div>
                <span className={cn("text-xs font-semibold tabular-nums", lowCredits ? "text-orange-400" : "text-[#FAFAFA]")}>
                  {profile.credits_balance}
                </span>
              </div>
            </>
          ) : (
            <div className={cn(
              "text-xs font-bold tabular-nums",
              lowCredits ? "text-orange-400" : "text-[#38BDF8]"
            )}>
              {profile.credits_balance}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="px-2 pb-2 space-y-0.5 border-t border-[#1A1A1A] pt-2">
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group relative",
                active ? "bg-[#38BDF8]/10 text-[#38BDF8]" : "text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111]",
                !open && "justify-center px-0"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {open && item.label}
              {!open && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-[#1A1A1A] text-[#FAFAFA] text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-[#222222]">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}

        {/* User avatar row */}
        <div className={cn("flex items-center gap-2.5 px-3 py-2 mt-1 rounded-xl hover:bg-[#111111] cursor-pointer transition-all", !open && "justify-center px-0")}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
            {profile.full_name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {open && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#FAFAFA] truncate">{profile.full_name ?? "User"}</p>
              <p className="text-[10px] text-[#555555] capitalize">{profile.plan_tier} plan</p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[68px] w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#333333] flex items-center justify-center hover:bg-[#222222] transition-all text-[#555555] hover:text-[#A0A0A0] z-10"
      >
        {open ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
    </aside>
  );
}
FILE 4 — components/layout/Header.tsx
tsx
"use client";
import { Search, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  profile: { full_name: string | null; credits_balance: number };
  onMenuClick: () => void;
  onCmdOpen: () => void;
}

export function Header({ profile, onMenuClick, onCmdOpen }: HeaderProps) {
  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-sm flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111] transition-all lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Center — Search trigger */}
      <button
        onClick={onCmdOpen}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#111111] border border-[#222222] rounded-xl text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all w-64"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Search anything...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#1A1A1A] rounded text-[10px] text-[#555555] font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111] transition-all relative">
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
FILE 5 — components/layout/CommandPalette.tsx
Use the cmdk package to build a full command palette:

tsx
"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  FolderOpen, Search, Users, Mail, Library,
  CreditCard, Settings, Plus, LogOut
} from "lucide-react";

const COMMANDS = [
  { group: "Navigate", label: "Projects",   icon: FolderOpen, href: "/projects" },
  { group: "Navigate", label: "Search",     icon: Search,     href: "/search" },
  { group: "Navigate", label: "Contacts",   icon: Users,      href: "/contacts" },
  { group: "Navigate", label: "Sequences",  icon: Mail,       href: "/sequences" },
  { group: "Navigate", label: "Library",    icon: Library,    href: "/library" },
  { group: "Navigate", label: "Billing",    icon: CreditCard, href: "/billing" },
  { group: "Navigate", label: "Settings",   icon: Settings,   href: "/settings" },
  { group: "Actions",  label: "New Project", icon: Plus,      href: "/projects?new=true" },
  { group: "Actions",  label: "New Search",  icon: Search,    href: "/search?new=true" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 bg-[#111111] border border-[#333333] rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.6)] overflow-hidden animate-slide-down">
        <Command className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-[#222222]">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#222222]">
            <Search className="w-4 h-4 text-[#555555] flex-shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-[#FAFAFA] text-sm placeholder-[#555555] outline-none"
              autoFocus
            />
            <kbd
              onClick={onClose}
              className="text-[10px] text-[#555555] bg-[#1A1A1A] border border-[#333333] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-[#222222]"
            >
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-[#555555]">
              No results found.
            </Command.Empty>

            {["Navigate", "Actions"].map((group) => {
              const items = COMMANDS.filter(c => c.group === group);
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[#555555] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {items.map((cmd) => {
                    const Icon = cmd.icon;
                    return (
                      <Command.Item
                        key={cmd.href}
                        value={cmd.label}
                        onSelect={() => handleSelect(cmd.href)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#A0A0A0] cursor-pointer data-[selected=true]:bg-[#38BDF8]/10 data-[selected=true]:text-[#38BDF8] transition-all"
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {cmd.label}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>

          <div className="px-4 py-2.5 border-t border-[#1A1A1A] flex items-center gap-4">
            <span className="text-[10px] text-[#555555]">↑↓ navigate</span>
            <span className="text-[10px] text-[#555555]">↵ select</span>
            <span className="text-[10px] text-[#555555]">esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
COMPLETION CHECKLIST
 app/(app)/layout.tsx — server component, auth + profile fetch

 components/layout/AppShell.tsx — sidebar + header + cmd palette wired

 components/layout/Sidebar.tsx — all 7 nav items, credits meter, collapse

 components/layout/Header.tsx — search trigger with ⌘K hint

 components/layout/CommandPalette.tsx — cmdk, navigate all routes

 Sidebar collapses to 64px icon-only mode

 Credits meter turns orange when < 20 credits

 ⌘K opens command palette on desktop

 Active nav item has left accent bar + blue text

BUILD LOG ENTRY
M02-01 App Shell — [date]
Files: app/(app)/layout.tsx, AppShell.tsx, Sidebar.tsx, Header.tsx, CommandPalette.tsx
Design: Dark #0A0A0A, collapsible sidebar 240px/64px, credits meter, ⌘K palette
Status: ✅ Complete