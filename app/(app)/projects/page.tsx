"use client";

/**
 * app/(app)/projects/page.tsx
 * Phase 1 — Projects Dashboard
 * Juicebox-inspired table with tabs, search bar, status badges, right panel.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Search, LayoutGrid, Users, Calendar, MoreHorizontal,
  Bot, Plug, ChevronRight, Loader2, FolderOpen, Edit2, ArchiveX, CheckCircle, Save, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "closed" | "archived";
  created_at: string;
  created_by: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_MAP = {
  active:   { label: "Active",   color: "text-emerald-700 border-emerald-200 bg-emerald-50" },
  closed:   { label: "Closed",   color: "text-gray-500 border-gray-200 bg-gray-50" },
  archived: { label: "Archived", color: "text-gray-500 border-gray-200 bg-gray-50" },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"mine" | "shared">("mine");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  
  // Action Context States
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (data.projects) setProjects(data.projects);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Click outside to close menu
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpenId]);

  const handleRename = async (e: React.MouseEvent | React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim() || !editingId) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        setProjects((p) => p.map((x) => x.id === id ? { ...x, title: editTitle.trim() } : x));
        setEditingId(null);
      }
    } catch (err) {}
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "closed" ? "active" : "closed";
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setProjects((p) => p.map((x) => x.id === id ? { ...x, status: newStatus as any } : x));
      }
    } catch (err) {}
    setMenuOpenId(null);
  };

  const filtered = projects.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex h-full gap-6">
      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Projects</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            Create new project
          </button>
        </div>

        {/* Tabs + Search bar */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {[
              { id: "mine" as const, label: "My Projects" },
              { id: "shared" as const, label: "Shared Projects" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-gray-100 text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-gray-100 px-5 py-3 bg-gray-50/50">
            {["Title", "Status", "Created", "Searches", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <FolderOpen className="h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-500 font-medium">
                {query ? "No projects matching your search" : "No projects yet"}
              </p>
              {!query && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="mt-1 flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 bg-white transition-all hover:border-brand-500/40 hover:text-brand-600 hover:bg-brand-50 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create your first project
                </button>
              )}
            </div>
          ) : (
            <div>
              {filtered.map((project, idx) => {
                const status = STATUS_MAP[project.status] ?? STATUS_MAP.active;
                return (
                  <div
                    key={project.id}
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className={cn(
                      "group grid cursor-pointer grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50",
                      idx > 0 && "border-t border-gray-100"
                    )}
                  >
                    {/* Title */}
                    <div className="min-w-0">
                      {editingId === project.id ? (
                        <form 
                          className="flex items-center gap-2"
                          onSubmit={(e) => handleRename(e, project.id)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full max-w-[200px] rounded-lg border border-brand-500/50 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                          />
                          <button type="submit" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><Save className="w-3.5 h-3.5"/></button>
                          <button type="button" onClick={() => setEditingId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"><X className="w-3.5 h-3.5"/></button>
                        </form>
                      ) : (
                        <>
                          <p className="truncate text-sm font-bold text-gray-900 group-hover:text-brand-600 transition-colors">{project.title}</p>
                          {project.description && (
                            <p className="mt-0.5 truncate text-[12px] font-medium text-gray-400 group-hover:text-gray-500 transition-colors">
                              {project.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Status pill */}
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium justify-self-start",
                      status.color
                    )}>
                      {status.label}
                    </span>

                    {/* Created date */}
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      {formatDate(project.created_at)}
                    </span>

                    {/* Searches (placeholder) */}
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500">
                      <Search className="h-3 w-3 text-gray-400" />
                      —
                    </span>

                    {/* More actions */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpenId === project.id) setMenuOpenId(null);
                          else setMenuOpenId(project.id);
                        }}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 hover:text-gray-900 opacity-0 group-hover:opacity-100",
                          menuOpenId === project.id ? "bg-gray-100 text-gray-900 opacity-100" : "text-gray-400"
                        )}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      <AnimatePresence>
                        {menuOpenId === project.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-gray-200 bg-white p-1 shadow-lg shadow-gray-200/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(project.id);
                                setEditTitle(project.title);
                                setMenuOpenId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Rename
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(project.id, project.status);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors mt-0.5"
                            >
                              {project.status === "closed" ? (
                                <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Reopen</>
                              ) : (
                                <><ArchiveX className="h-3.5 w-3.5 text-red-500" /> Close Project</>
                              )}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>



      {/* ── Create Modal ── */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => loadProjects()}
      />
    </div>
  );
}
