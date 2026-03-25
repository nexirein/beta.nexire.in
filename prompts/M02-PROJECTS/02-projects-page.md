<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/projects.md        ← this module's API contract
-->

M02 — TASK 02: PROJECTS LIST PAGE
Trae: Read CLAUDE.md first. This is the first screen users see after login.
YC-style dark dashboard — clean, fast, impressive.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build /projects page that shows:

Greeting header ("Good morning, Priya")

Stats row (active projects, total shortlisted, credits used)

Projects grid with filter tabs (All / Active / Closed)

Empty state for new users

"New Project" button that opens the create modal (built in task 03)

DESIGN SPEC
Page padding: px-6 py-6 (desktop) | px-4 py-4 (mobile)
Max width: max-w-6xl mx-auto
Stats cards: bg-[#111111] border border-[#222222] rounded-2xl
Project cards: bg-[#111111] border border-[#222222] rounded-2xl hover:border-[#333333] hover:shadow-glow-blue-sm
Empty state: centered icon + text + CTA, bg-[#0D0D0D] dashed border border-[#222222]
Filter tabs: pill buttons, active = bg-[#38BDF8]/10 text-[#38BDF8]

FILE 1 — app/(app)/projects/page.tsx [Server Component]
tsx
import { createClient } from "@/lib/supabase/server";
import { ProjectsClient } from "./ProjectsClient";
import { getProjects } from "@/lib/supabase/queries/projects";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [projects, profile] = await Promise.all([
    getProjects(user!.id),
    supabase.from("profiles").select("full_name, credits_balance, plan_tier, results_used_mtd").eq("id", user!.id).single(),
  ]);

  return (
    <ProjectsClient
      initialProjects={projects ?? []}
      profile={profile.data}
    />
  );
}
FILE 2 — app/(app)/projects/ProjectsClient.tsx [Client Component]
tsx
"use client";
import { useState } from "react";
import { Plus, FolderOpen, Briefcase, Users, Zap } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectModal } from "./CreateProjectModal";
import { EmptyProjects } from "./EmptyProjects";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

type Project = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  ctc_min_lpa: number | null;
  ctc_max_lpa: number | null;
  status: "active" | "closed" | "on_hold";
  shortlist_count: number;
  contacted_count: number;
  created_at: string;
};

const FILTERS = ["all", "active", "closed", "on_hold"] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  active: "Active",
  closed: "Closed",
  on_hold: "On Hold",
};

function getGreeting(name: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${greeting}, ${name?.split(" ") ?? "there"} 👋`;
}

export function ProjectsClient({
  initialProjects,
  profile,
}: {
  initialProjects: Project[];
  profile: { full_name: string | null; credits_balance: number; plan_tier: string; results_used_mtd: number } | null;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const searchParams = useSearchParams();

  // Open modal if ?new=true (from ⌘K)
  useState(() => {
    if (searchParams.get("new") === "true") setModalOpen(true);
  });

  const filtered = projects.filter(p => filter === "all" ? true : p.status === filter);
  const activeCount = projects.filter(p => p.status === "active").length;
  const totalShortlisted = projects.reduce((sum, p) => sum + p.shortlist_count, 0);

  const handleProjectCreated = (newProject: Project) => {
    setProjects(prev => [newProject, ...prev]);
    setModalOpen(false);
  };

  const STATS = [
    { label: "Active Roles", value: activeCount, icon: Briefcase, color: "text-[#38BDF8]" },
    { label: "Total Shortlisted", value: totalShortlisted, icon: Users, color: "text-purple-400" },
    { label: "Credits Left", value: profile?.credits_balance ?? 0, icon: Zap, color: profile?.credits_balance! < 20 ? "text-orange-400" : "text-green-400" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 animate-fade-in">
      {/* Header row */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#FAFAFA]">
            {getGreeting(profile?.full_name ?? null)}
          </h1>
          <p className="text-sm text-[#555555] mt-1">
            {projects.length === 0
              ? "Create your first project to start sourcing candidates"
              : `${activeCount} active role${activeCount !== 1 ? "s" : ""} in progress`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] hover:from-[#0EA5E9] hover:to-[#0284C7] text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-glow-blue-sm"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-[#111111] border border-[#222222] rounded-2xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                <Icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#FAFAFA] tabular-nums">{stat.value}</p>
                <p className="text-xs text-[#555555] mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter tabs */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 mb-5">
          {FILTERS.map((f) => {
            const count = f === "all" ? projects.length : projects.filter(p => p.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all",
                  filter === f
                    ? "bg-[#38BDF8]/10 text-[#38BDF8]"
                    : "text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111]"
                )}
              >
                {FILTER_LABELS[f]}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-md font-semibold",
                  filter === f ? "bg-[#38BDF8]/20 text-[#38BDF8]" : "bg-[#1A1A1A] text-[#555555]"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid or empty */}
      {filtered.length === 0 && projects.length === 0 ? (
        <EmptyProjects onNewProject={() => setModalOpen(true)} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[#555555] text-sm">No {filter} projects</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
FILE 3 — app/(app)/projects/ProjectCard.tsx
tsx
import Link from "next/link";
import { Users, MapPin, DollarSign, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  active:   { dot: "bg-green-400",  text: "text-green-400",  label: "Active" },
  closed:   { dot: "bg-[#555555]",  text: "text-[#555555]",  label: "Closed" },
  on_hold:  { dot: "bg-yellow-400", text: "text-yellow-400", label: "On Hold" },
};

function formatCTC(min: number | null, max: number | null) {
  if (!min && !max) return null;
  if (min && max) return `₹${min}–${max} LPA`;
  if (min) return `₹${min}+ LPA`;
  return `Up to ₹${max} LPA`;
}

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ProjectCard({ project }: { project: any }) {
  const status = STATUS_STYLES[project.status as keyof typeof STATUS_STYLES];
  const ctc = formatCTC(project.ctc_min_lpa, project.ctc_max_lpa);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block bg-[#111111] border border-[#222222] rounded-2xl p-5 hover:border-[#333333] hover:shadow-glow-blue-sm transition-all duration-200 animate-fade-in"
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="font-semibold text-[#FAFAFA] text-sm truncate group-hover:text-[#38BDF8] transition-colors">
            {project.title}
          </h3>
          {project.company && (
            <p className="text-xs text-[#555555] mt-0.5 truncate">{project.company}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
          <span className={cn("text-[11px] font-medium", status.text)}>{status.label}</span>
        </div>
      </div>

      {/* Meta chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {project.location && (
          <span className="flex items-center gap-1 text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2 py-1">
            <MapPin className="w-3 h-3" />
            {project.location}
          </span>
        )}
        {ctc && (
          <span className="flex items-center gap-1 text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2 py-1">
            <DollarSign className="w-3 h-3" />
            {ctc}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1A1A1A]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-[#555555]">
            <Users className="w-3.5 h-3.5" />
            <span className="font-medium text-[#A0A0A0]">{project.shortlist_count}</span> shortlisted
          </span>
          <span className="flex items-center gap-1 text-xs text-[#555555]">
            <Clock className="w-3 h-3" />
            {timeAgo(project.created_at)}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-[#333333] group-hover:text-[#38BDF8] transition-colors" />
      </div>
    </Link>
  );
}
FILE 4 — app/(app)/projects/EmptyProjects.tsx
tsx
import { FolderOpen, Plus, Search, Zap } from "lucide-react";

const STEPS = [
  { icon: FolderOpen, label: "Create a project", desc: "Define the role, CTC, and location" },
  { icon: Search,     label: "Search candidates", desc: "AI finds matching profiles instantly" },
  { icon: Zap,        label: "Reveal & reach out", desc: "Get email/phone with 1 click" },
];

export function EmptyProjects({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#222222] flex items-center justify-center mb-6">
        <FolderOpen className="w-8 h-8 text-[#38BDF8]" />
      </div>

      <h2 className="text-xl font-semibold text-[#FAFAFA] mb-2">Start your first project</h2>
      <p className="text-sm text-[#555555] mb-10 text-center max-w-sm">
        A project holds your job requirement and all shortlisted candidates. Create one to begin sourcing.
      </p>

      {/* 3-step flow */}
      <div className="flex items-center gap-4 mb-10">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-center gap-4">
              <div className="flex flex-col items-center text-center w-32">
                <div className="w-10 h-10 rounded-xl bg-[#111111] border border-[#222222] flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5 text-[#38BDF8]" />
                </div>
                <p className="text-xs font-medium text-[#FAFAFA]">{step.label}</p>
                <p className="text-[10px] text-[#555555] mt-0.5">{step.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px bg-[#222222] flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onNewProject}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] hover:from-[#0EA5E9] hover:to-[#0284C7] text-white font-medium rounded-xl transition-all duration-200 shadow-glow-blue-sm"
      >
        <Plus className="w-4 h-4" />
        Create your first project
      </button>
    </div>
  );
}
FILE 5 — lib/supabase/queries/projects.ts
typescript
import { createClient } from "@/lib/supabase/server";

export async function getProjects(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, company, location, ctc_min_lpa, ctc_max_lpa, status, shortlist_count, contacted_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProject(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject(userId: string, orgId: string, payload: {
  title: string;
  company?: string;
  location?: string;
  ctc_min_lpa?: number;
  ctc_max_lpa?: number;
  notice_max_days?: number;
  jd_text?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, org_id: orgId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(projectId: string, userId: string, payload: Partial<{
  title: string; company: string; location: string;
  ctc_min_lpa: number; ctc_max_lpa: number; status: string;
  notice_max_days: number; jd_text: string;
}>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(projectId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}
COMPLETION CHECKLIST
 app/(app)/projects/page.tsx — server component, parallel data fetch

 ProjectsClient.tsx — filter tabs, stats row, greeting

 ProjectCard.tsx — status dot, meta chips, hover glow

 EmptyProjects.tsx — 3-step visual flow + CTA

 lib/supabase/queries/projects.ts — CRUD functions

 Page loads data from Supabase correctly

 Filter tabs show correct counts

 Clicking a card navigates to /projects/[id]

BUILD LOG ENTRY
M02-02 Projects Page — [date]
Files: projects/page.tsx, ProjectsClient.tsx, ProjectCard.tsx, EmptyProjects.tsx, lib/supabase/queries/projects.ts
Status: ✅ Complete