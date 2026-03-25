<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/projects.md        ← this module's API contract
-->

M02 — TASK 04: PROJECT DETAIL PAGE (/projects/[id])
Trae: Read CLAUDE.md first.
This page is the hub for a single role: overview tabs + shortlist pipeline.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build /projects/[id] with:

Project header (title, company, status badge, quick actions)

Tab navigation: Overview | Shortlist | Activity

Overview tab: project details + "Start Search" CTA → /search?project=[id]

Shortlist tab: kanban-style pipeline with 6 columns (New → Reviewing → Contacting → Offered → Rejected → Hired)

Edit project modal (reuse CreateProjectModal from task 03)

FILE 1 — app/(app)/projects/[id]/page.tsx [Server Component]
tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./ProjectDetailClient";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [projectRes, shortlistRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", params.id).eq("user_id", user!.id).single(),
    supabase.from("shortlists")
      .select("*, candidates(id, full_name, current_title, current_company, location_city, skills, experience_years, linkedin_url, email, phone)")
      .eq("project_id", params.id)
      .order("added_at", { ascending: false }),
  ]);

  if (projectRes.error || !projectRes.data) notFound();

  return (
    <ProjectDetailClient
      project={projectRes.data}
      shortlistItems={shortlistRes.data ?? []}
    />
  );
}
FILE 2 — app/(app)/projects/[id]/ProjectDetailClient.tsx
Build a full client component:

tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Edit2, Trash2, MoreHorizontal,
  MapPin, DollarSign, Clock, Users, ExternalLink, Share2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "../CreateProjectModal";
import { ShortlistPipeline } from "./ShortlistPipeline";

type Tab = "overview" | "shortlist" | "activity";

const STATUS_STYLES = {
  active:  { label: "Active",  dot: "bg-green-400",  badge: "bg-green-400/10 text-green-400" },
  closed:  { label: "Closed",  dot: "bg-[#555555]",  badge: "bg-[#1A1A1A] text-[#555555]" },
  on_hold: { label: "On Hold", dot: "bg-yellow-400", badge: "bg-yellow-400/10 text-yellow-400" },
};

export function ProjectDetailClient({ project: initialProject, shortlistItems }: any) {
  const [project, setProject] = useState(initialProject);
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const status = STATUS_STYLES[project.status as keyof typeof STATUS_STYLES];

  const handleDelete = async () => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Project deleted");
      router.push("/projects");
    } else {
      toast.error("Delete failed");
    }
  };

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",  label: "Overview" },
    { id: "shortlist", label: "Shortlist", count: shortlistItems.length },
    { id: "activity",  label: "Activity" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 animate-fade-in">
      {/* Back breadcrumb */}
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-[#555555] hover:text-[#A0A0A0] mb-5 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        All projects
      </Link>

      {/* Project Header Card */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          {/* Left */}
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg", status.badge)}>
                <div className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-[#FAFAFA] mb-1">{project.title}</h1>
            {project.company && <p className="text-[#555555] text-sm mb-3">{project.company}</p>}

            {/* Meta row */}
            <div className="flex flex-wrap gap-3">
              {project.location && (
                <span className="flex items-center gap-1.5 text-xs text-[#555555]">
                  <MapPin className="w-3.5 h-3.5" /> {project.location}
                </span>
              )}
              {(project.ctc_min_lpa || project.ctc_max_lpa) && (
                <span className="flex items-center gap-1.5 text-xs text-[#555555]">
                  <DollarSign className="w-3.5 h-3.5" />
                  {project.ctc_min_lpa && project.ctc_max_lpa
                    ? `₹${project.ctc_min_lpa}–${project.ctc_max_lpa} LPA`
                    : project.ctc_min_lpa
                    ? `₹${project.ctc_min_lpa}+ LPA`
                    : `Up to ₹${project.ctc_max_lpa} LPA`}
                </span>
              )}
              {project.notice_max_days && (
                <span className="flex items-center gap-1.5 text-xs text-[#555555]">
                  <Clock className="w-3.5 h-3.5" /> Up to {project.notice_max_days}d notice
                </span>
              )}
              <span className="flex items-center gap-1.5 text-xs text-[#555555]">
                <Users className="w-3.5 h-3.5" /> {project.shortlist_count} shortlisted
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/search?project=${project.id}`}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium rounded-xl hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              Search candidates
            </Link>
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-xl border border-[#333333] text-[#555555] hover:text-[#A0A0A0] hover:border-[#444444] transition-all"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-xl border border-[#333333] text-[#555555] hover:text-[#A0A0A0] hover:border-[#444444] transition-all"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#1A1A1A] border border-[#333333] rounded-xl shadow-xl z-10 w-44 overflow-hidden animate-slide-down">
                  <button
                    onClick={() => { setMenuOpen(false); /* TODO: mark closed */ }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#A0A0A0] hover:bg-[#222222] transition-all"
                  >
                    Mark as closed
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); handleDelete(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#222222] transition-all"
                  >
                    Delete project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 mb-6 bg-[#111111] border border-[#1A1A1A] rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t.id
                ? "bg-[#1A1A1A] text-[#FAFAFA] shadow-sm"
                : "text-[#555555] hover:text-[#A0A0A0]"
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md",
                tab === t.id ? "bg-[#38BDF8]/20 text-[#38BDF8]" : "bg-[#1A1A1A] text-[#555555]"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="space-y-4 animate-fade-in">
          {project.jd_text ? (
            <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6">
              <h3 className="text-sm font-medium text-[#A0A0A0] mb-3">Job Description</h3>
              <p className="text-sm text-[#FAFAFA] whitespace-pre-wrap leading-relaxed">
                {project.jd_text}
              </p>
            </div>
          ) : (
            <div className="bg-[#111111] border border-dashed border-[#333333] rounded-2xl p-8 text-center">
              <p className="text-sm text-[#555555] mb-3">No JD added yet</p>
              <button
                onClick={() => setEditOpen(true)}
                className="text-sm text-[#38BDF8] hover:text-[#0EA5E9] transition-colors"
              >
                Add job description →
              </button>
            </div>
          )}

          {/* Start search CTA if no shortlists */}
          {shortlistItems.length === 0 && (
            <div className="bg-gradient-to-br from-[#38BDF8]/5 to-[#0EA5E9]/5 border border-[#38BDF8]/20 rounded-2xl p-8 text-center">
              <Search className="w-8 h-8 text-[#38BDF8] mx-auto mb-3" />
              <h3 className="text-base font-semibold text-[#FAFAFA] mb-2">
                Find matching candidates
              </h3>
              <p className="text-sm text-[#555555] mb-4">
                Use AI search to find candidates and shortlist them here
              </p>
              <Link
                href={`/search?project=${project.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium rounded-xl hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
              >
                <Search className="w-4 h-4" />
                Start searching
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === "shortlist" && (
        <ShortlistPipeline items={shortlistItems} projectId={project.id} />
      )}

      {tab === "activity" && (
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-8 text-center animate-fade-in">
          <p className="text-sm text-[#555555]">Activity timeline coming soon</p>
        </div>
      )}

      {/* Edit Modal */}
      <CreateProjectModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onCreated={(updated) => { setProject(updated); setEditOpen(false); }}
        editProject={project}
      />
    </div>
  );
}
FILE 3 — app/(app)/projects/[id]/ShortlistPipeline.tsx
tsx
"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PIPELINE_STAGES = [
  { id: "new",        label: "New",        color: "text-[#A0A0A0]",  bg: "bg-[#1A1A1A]" },
  { id: "reviewing",  label: "Reviewing",  color: "text-blue-400",   bg: "bg-blue-400/10" },
  { id: "contacting", label: "Contacting", color: "text-purple-400", bg: "bg-purple-400/10" },
  { id: "offered",    label: "Offered",    color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { id: "rejected",   label: "Rejected",   color: "text-[#EF4444]",  bg: "bg-[#EF4444]/10" },
  { id: "hired",      label: "Hired 🎉",   color: "text-green-400",  bg: "bg-green-400/10" },
];

export function ShortlistPipeline({ items, projectId }: { items: any[]; projectId: string }) {
  const [shortlistItems, setShortlistItems] = useState(items);

  const updateStatus = async (itemId: string, newStatus: string) => {
    const res = await fetch(`/api/shortlist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setShortlistItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
    } else {
      toast.error("Failed to update status");
    }
  };

  if (shortlistItems.length === 0) {
    return (
      <div className="bg-[#111111] border border-dashed border-[#333333] rounded-2xl p-12 text-center animate-fade-in">
        <Users className="w-8 h-8 text-[#333333] mx-auto mb-3" />
        <p className="text-sm text-[#555555]">No candidates shortlisted yet</p>
        <p className="text-xs text-[#333333] mt-1">Search and shortlist candidates to see them here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto animate-fade-in">
      <div className="flex gap-4 min-w-max pb-4">
        {PIPELINE_STAGES.map(stage => {
          const stageItems = shortlistItems.filter(i => i.status === stage.id);
          return (
            <div key={stage.id} className="w-72 flex-shrink-0">
              {/* Column header */}
              <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl mb-3", stage.bg)}>
                <span className={cn("text-xs font-semibold", stage.color)}>{stage.label}</span>
                <span className={cn("text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded-md", stage.bg, stage.color)}>
                  {stageItems.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {stageItems.map(item => (
                  <div
                    key={item.id}
                    className="bg-[#111111] border border-[#222222] rounded-xl p-3.5 hover:border-[#333333] transition-all cursor-default"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-[#FAFAFA]">{item.candidates?.full_name}</p>
                        <p className="text-xs text-[#555555] mt-0.5">{item.candidates?.current_title}</p>
                      </div>
                      {/* Stage move dropdown */}
                      <select
                        value={item.status}
                        onChange={e => updateStatus(item.id, e.target.value)}
                        className="text-[10px] bg-[#1A1A1A] border border-[#333333] rounded-lg px-1.5 py-1 text-[#555555] cursor-pointer"
                      >
                        {PIPELINE_STAGES.map(s => (
                          <option key={s.id} value={s.id} className="bg-[#111111]">{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-[#555555]">{item.candidates?.current_company}</p>
                    {item.ctc_expected_lpa && (
                      <p className="text-[11px] text-[#38BDF8] mt-1">₹{item.ctc_expected_lpa} LPA</p>
                    )}
                    {item.notice_days_actual !== null && item.notice_days_actual !== undefined && (
                      <p className="text-[11px] text-[#555555]">{item.notice_days_actual}d notice</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
FILE 4 — app/api/shortlist/[id]/route.ts
typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const UpdateShortlistSchema = z.object({
  status:             z.enum(["new","reviewing","contacting","offered","rejected","hired"]).optional(),
  notes:              z.string().max(2000).optional(),
  ctc_expected_lpa:   z.number().min(0).max(999).optional(),
  notice_days_actual: z.number().int().min(0).max(365).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = UpdateShortlistSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data, error } = await supabase
    .from("shortlists")
    .update({ ...parsed.data, status_updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shortlist: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("shortlists")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
COMPLETION CHECKLIST
 /projects/[id] loads project + shortlist in parallel

 Header: title, company, status badge, meta chips, 3 action buttons

 Tabs: Overview / Shortlist / Activity with correct counts

 Overview tab: JD section + empty search CTA

 Shortlist tab: 6-column pipeline, status move dropdown

 Edit modal reuses CreateProjectModal

 Delete redirects to /projects

 api/shortlist/[id] PATCH + DELETE with auth + Zod

BUILD LOG ENTRY
M02-04 Project Detail — [date]
Files: projects/[id]/page.tsx, ProjectDetailClient.tsx, ShortlistPipeline.tsx, api/shortlist/[id]/route.ts
Status: ✅ Complete