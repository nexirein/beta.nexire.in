"use client";

/**
 * components/shell/Sidebar.tsx
 * Phase 5 — Light-mode Nexire sidebar (Section 5 design system).
 *
 * Key features:
 * - White/grey light-mode palette (#4C6DFD blue brand)
 * - Collapse/expand animation (framer-motion 200ms)
 * - Project switcher dropdown
 * - Recent searches section with company-logo hover tooltip on items
 * - Bottom user section with getting-started progress
 * - Mobile: collapses to bottom nav
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Users, Mail, BarChart2, Settings,
  HelpCircle, ChevronDown, Menu, X,
  Star, Layers, Zap, LayoutGrid, PanelLeft, Bot, Clock, ExternalLink,
  MoreHorizontal, Pencil, Trash2, Building2,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useUser } from "@/lib/hooks/useUser";
import { useTheme, THEMES } from "@/lib/hooks/useTheme";
import { Palette } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  status: string;
}

interface RecentSearch {
  id: string;
  name: string;
  snippet: string | null;
  projectId: string;
  updatedAt: string | null;
  createdAt: string | null;
}

interface SearchesSectionProps {
  activeProjectId: string | null;
  recentSearches: RecentSearch[];
  setRecentSearches: React.Dispatch<React.SetStateAction<RecentSearch[]>>;
  isActive: (href: string) => boolean;
  setHistoryModalOpen: (open: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 224;
const SIDEBAR_COLLAPSED = 56;

// ─── Component ────────────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  useRouter();
  const { profile, org } = useUser();

  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const { theme: currentTheme, setTheme } = useTheme();

  const activeProject = projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        if (data.projects) {
          setProjects(data.projects);
          const first = data.projects.find((p: Project) => p.status === "active") ?? data.projects[0];
          if (first) setActiveProjectId(first.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    const fetchSearches = () => {
      fetch(`/api/projects/${activeProjectId}/searches`)
        .then((res) => res.json())
        .then((data) => { if (data.searches) setRecentSearches(data.searches); })
        .catch(() => {});
    };
    fetchSearches();

    const handleSearchRename = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; title: string }>;
      const { id, title } = customEvent.detail;
      setRecentSearches((prev) => {
        const exists = prev.some((s) => s.id === id);
        if (exists) return prev.map((s) => s.id === id ? { ...s, name: title, updatedAt: new Date().toISOString() } : s);
        return [{ id, name: title, snippet: null, projectId: activeProjectId, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, ...prev];
      });
    };

    window.addEventListener("searchRename", handleSearchRename);
    return () => window.removeEventListener("searchRename", handleSearchRename);
  }, [activeProjectId, pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // ─── Nav Item ──────────────────────────────────────────────────────────────
  const NavItem = ({
    href, icon, label, badge, disabled, indent = false, className,
  }: {
    href: string; icon?: React.ReactNode; label: string;
    badge?: number | string; disabled?: boolean; indent?: boolean; className?: string;
  }) => {
    const active = isActive(href);
    return (
      <Link
        href={disabled ? "#" : href}
        onClick={(e) => { if (disabled) e.preventDefault(); }}
        title={collapsed ? label : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-all duration-150",
          collapsed ? "justify-center px-0" : "px-2.5",
          indent && !collapsed && "ml-5 text-xs",
          active
            ? "bg-brand-50 text-brand-600"
            : "text-text-secondary hover:bg-gray-50 hover:text-text-primary",
          disabled && "cursor-not-allowed opacity-40",
          className
        )}
      >
        {/* Blue left indicator */}
        {active && !collapsed && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-500" />
        )}

        {icon && (
          <span className={cn("flex-shrink-0", active ? "text-brand-500" : "text-text-tertiary group-hover:text-text-secondary")}>
            {icon}
          </span>
        )}

        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            {badge !== undefined && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
            {disabled && (
              <span className="ml-auto text-[9px] uppercase tracking-widest text-text-tertiary">Soon</span>
            )}
          </>
        )}
      </Link>
    );
  };

  // ─── Sidebar Content ───────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* ── Logo + Collapse ── */}
      <div className={cn(
        "flex items-center border-b border-gray-100 py-4",
        collapsed ? "justify-center px-0" : "justify-between px-4"
      )}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className={cn("flex items-center justify-center overflow-hidden", logoError ? "h-7 w-7 rounded-lg bg-brand-500" : "h-8 w-auto max-w-[140px] bg-transparent")}>
              {!logoError ? (
                <img src="/assets/logos/logo.png" alt="Logo" className="max-h-8 w-auto object-contain object-left" onError={() => setLogoError(true)} />
              ) : (
                <Zap className="h-4 w-4 text-white" />
              )}
            </div>
            {logoError && (
              <span className="text-base font-bold text-brand-600 tracking-tight">Nexire</span>
            )}
          </Link>
        )}
        {collapsed && (
          <div className="flex items-center justify-center p-1">
            <img 
              src="/favicon.ico" 
              alt="Nexire" 
              className="h-7 w-7 object-contain" 
            />
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-gray-100 hover:text-text-primary",
            collapsed && "ml-0"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Project Switcher ── */}
      {!collapsed && (
        <div className="relative px-3 py-3">
          <button
            onClick={() => setProjectDropdownOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-white shadow-sm"
          >
            <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0 text-brand-500" />
            <span className="flex-1 truncate text-sm font-medium text-text-primary">
              {activeProject
                ? activeProject.title.slice(0, 18) + (activeProject.title.length > 18 ? "…" : "")
                : "Select project"}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-text-tertiary transition-transform", projectDropdownOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {projectDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white p-1 shadow-xl shadow-gray-200/80"
              >
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProjectId(p.id); setProjectDropdownOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      p.id === activeProjectId
                        ? "bg-brand-50 text-brand-600"
                        : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full flex-shrink-0", p.id === activeProjectId ? "bg-brand-500" : "bg-green-500")} />
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
                <div className="mx-1 my-1 h-px bg-gray-100" />
                <Link
                  href="/projects"
                  onClick={() => setProjectDropdownOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-500 transition-colors hover:bg-brand-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>All Projects</span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Project Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {!collapsed && (
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            This Project
          </p>
        )}

        {!collapsed && (
          <SearchesSection
            activeProjectId={activeProjectId}
            recentSearches={recentSearches}
            setRecentSearches={setRecentSearches}
            isActive={isActive}
            setHistoryModalOpen={setHistoryModalOpen}
          />
        )}

        {collapsed && (
          <NavItem
            href={activeProjectId ? `/search?project_id=${activeProjectId}` : "/search"}
            icon={<Search className="h-4 w-4" />}
            label="New Search"
          />
        )}

        <NavItem href="/shortlist" icon={<Star className="h-4 w-4" />} label="Shortlist" />
        <NavItem href="/contacts" icon={<Users className="h-4 w-4" />} label="Contacts" />
        <NavItem href="/sequences" icon={<Mail className="h-4 w-4" />} label="Sequences" />

        <div className="my-3 h-px bg-gray-100" />

        {!collapsed && (
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            Workspace
          </p>
        )}

        <NavItem href="/projects" icon={<Layers className="h-4 w-4" />} label="All Projects" />
      </nav>

      {/* ── Bottom Section ── */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-0.5 bg-white relative">
        <NavItem href="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        <NavItem href="/support" icon={<HelpCircle className="h-4 w-4" />} label="Support" />
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile Hamburger ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-text-secondary shadow-sm lg:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* ── Mobile Overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar ── */}
      <motion.aside
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={cn(
          "relative hidden h-full flex-shrink-0 flex-col border-r border-gray-200 bg-white lg:flex shadow-sm",
          "overflow-hidden"
        )}
        style={{ minWidth: collapsed ? SIDEBAR_COLLAPSED : undefined }}
      >
        {sidebarContent}
      </motion.aside>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ width: SIDEBAR_EXPANDED }}
            className="fixed left-0 top-0 z-50 h-full flex-shrink-0 flex-col border-r border-gray-200 bg-white flex lg:hidden shadow-xl"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-gray-200 bg-white px-4 py-2 lg:hidden shadow-lg">
        {[
          { href: "/search", icon: <Search className="h-5 w-5" />, label: "Search" },
          { href: "/shortlist", icon: <Star className="h-5 w-5" />, label: "Shortlist" },
          { href: "/projects", icon: <Layers className="h-5 w-5" />, label: "Projects" },
          { href: "/contacts", icon: <Users className="h-5 w-5" />, label: "Contacts" },
          { href: "/sequences", icon: <Mail className="h-5 w-5" />, label: "Sequences" },
          { href: "/settings", icon: <Settings className="h-5 w-5" />, label: "Settings" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg p-2 text-[10px] transition-colors",
              isActive(item.href) ? "text-brand-500" : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* ── Search History Modal ── */}
      <AnimatePresence>
        {historyModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setHistoryModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-xl mx-4 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <Clock className="w-5 h-5 text-brand-500" />
                    Search History
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">{activeProject?.title}</p>
                </div>
                <button
                  onClick={() => setHistoryModalOpen(false)}
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {recentSearches.length === 0 ? (
                  <div className="text-center py-12 text-text-tertiary text-sm">
                    No previous searches yet. Run your first search!
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {recentSearches.map((s) => (
                      <Link
                        key={s.id}
                        href={`/search?project_id=${s.projectId}&search_id=${s.id}`}
                        onClick={() => setHistoryModalOpen(false)}
                        className="flex items-start justify-between group px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-semibold text-text-primary group-hover:text-brand-500 transition-colors truncate">
                            {s.name || "Untitled Search"}
                          </span>
                          {s.snippet && (
                            <span className="text-xs text-text-secondary mt-0.5 truncate">{s.snippet}</span>
                          )}
                          <span className="text-[10px] text-text-tertiary mt-1">{timeAgo(s.updatedAt)}</span>
                        </div>
                        <ExternalLink className="w-4 h-4 text-text-tertiary group-hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-all ml-3 mt-0.5 flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function SearchesSection({ activeProjectId, recentSearches, setRecentSearches, isActive, setHistoryModalOpen }: SearchesSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  void router;

  const handleDelete = async (searchId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpenId(null);
    try {
      await fetch(`/api/searches/${searchId}`, { method: "DELETE" });
      setRecentSearches((prev) => prev.filter((s) => s.id !== searchId));
    } catch { /* ignore */ }
  };

  const handleRenameSubmit = async (searchId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await fetch(`/api/searches/${searchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      setRecentSearches((prev) => prev.map((s) => s.id === searchId ? { ...s, name: renameValue.trim() } : s));
    } catch { /* ignore */ }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="mb-2">
      {/* Searches header */}
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-brand-500" />
          <span className="text-sm font-semibold text-text-primary">Searches</span>
        </div>
        <button
          onClick={() => {
            if (pathname === "/search") {
              window.dispatchEvent(new CustomEvent("startNewSearch"));
            } else {
              router.push(activeProjectId ? `/search?project_id=${activeProjectId}` : "/search");
            }
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-sm"
          title="New Search"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search items */}
      <div className="relative ml-3 pl-3 border-l-2 border-gray-100 flex flex-col gap-0.5">
        {recentSearches.length === 0 && (
          <p className="py-1 text-[12px] text-text-tertiary">No searches yet</p>
        )}

        {recentSearches.slice(0, 5).map((s) => {
          const active = isActive(`/search?project_id=${s.projectId}&search_id=${s.id}`);
          return (
            <div
              key={s.id}
              className={cn(
                "group relative flex items-center px-2.5 py-1.5 rounded-lg transition-all",
                active
                  ? "bg-brand-50 text-brand-600"
                  : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
              )}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Company logo hover card — shows when hovering over the item */}
              <AnimatePresence>
                {hoveredId === s.id && s.snippet && (
                  <motion.div
                    initial={{ opacity: 0, x: 8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-none"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Placeholder company logo */}
                      <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-text-primary truncate">{s.name || "Search"}</p>
                        <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{s.snippet}</p>
                        <p className="text-[10px] text-text-tertiary mt-1.5">{timeAgo(s.updatedAt)}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {renamingId === s.id ? (
                <input
                  autoFocus
                  className={cn(
                    "flex-1 h-6 text-[12px] bg-transparent focus:outline-none border-b border-brand-400",
                    active ? "text-brand-600" : "text-text-primary"
                  )}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameSubmit(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(s.id);
                    if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                  }}
                />
              ) : (
                <Link
                  href={`/search?project_id=${s.projectId}&search_id=${s.id}`}
                  className="flex-1 min-w-0 flex items-center overflow-hidden"
                  onClick={() => setMenuOpenId(null)}
                >
                  <span className={cn("truncate text-[12px] font-medium leading-tight", active && "text-brand-600")}>
                    {s.name || "New Search"}
                  </span>
                </Link>
              )}

              <div className="relative flex-shrink-0 ml-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === s.id ? null : s.id);
                  }}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded transition-all",
                    active
                      ? "text-brand-400 hover:text-brand-600 hover:bg-brand-100"
                      : "text-text-tertiary hover:text-text-primary hover:bg-gray-100"
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </button>

                <AnimatePresence>
                  {menuOpenId === s.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -4 }}
                      transition={{ duration: 0.1 }}
                      className="absolute right-0 top-6 z-50 w-36 rounded-xl border border-gray-200 bg-white shadow-xl p-1"
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpenId(null);
                          setRenamingId(s.id);
                          setRenameValue(s.name || "");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Rename
                      </button>
                      <button
                        onClick={(e) => handleDelete(s.id, e)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}

        {recentSearches.length > 5 && (
          <div className="px-2 pt-1 pb-1">
            <button
              onClick={() => setHistoryModalOpen(true)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all flex items-center gap-1.5"
            >
              <Clock className="w-3 h-3" />
              view {recentSearches.length - 5} more searches
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
