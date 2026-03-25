<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/projects.md        ← this module's API contract
-->

M02 — TASK 03: CREATE + EDIT PROJECT MODAL + API ROUTE
Trae: Read CLAUDE.md first. This builds the modal form to create/edit projects.
Reused in both /projects (new) and /projects/[id] (edit).
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build a dark multi-field modal:

Title, Company, Location (city search autocomplete from static list)

CTC Range (min/max LPA — manual, since Prospeo doesn't have this)

Notice Period max (dropdown: Any / 15 / 30 / 60 / 90 days)

JD text (textarea, optional, used for AI search later)

Validation with Zod (client + server)

API route: POST /api/projects (create), PATCH /api/projects/[id] (edit)

DESIGN SPEC
Modal overlay: bg-black/60 backdrop-blur-sm
Modal panel: bg-[#111111] border border-[#333333] rounded-2xl max-w-lg w-full
Header: "New Project" title + X close button
Input style: bg-[#0A0A0A] border border-[#333333] focus:border-[#38BDF8] text-[#FAFAFA] rounded-xl
Label: text-[#A0A0A0] text-xs font-medium mb-1.5
Section divider: thin border-[#1A1A1A] my-5
CTA: full-width gradient button

FILE 1 — app/(app)/projects/CreateProjectModal.tsx
tsx
"use client";
import { useState } from "react";
import { X, Loader2, MapPin, Building2, DollarSign, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const NOTICE_OPTIONS = [
  { value: "",   label: "Any notice period" },
  { value: "15", label: "Up to 15 days" },
  { value: "30", label: "Up to 30 days" },
  { value: "60", label: "Up to 60 days" },
  { value: "90", label: "Up to 90 days" },
];

const INDIA_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata",
  "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Chandigarh", "Indore", "Noida",
  "Gurgaon", "Kochi", "Coimbatore", "Nagpur", "Bhopal", "Visakhapatnam",
  "Remote", "Pan India", "Hybrid",
];

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: any) => void;
  editProject?: any; // if provided, switches to edit mode
}

interface FormState {
  title: string;
  company: string;
  location: string;
  ctc_min_lpa: string;
  ctc_max_lpa: string;
  notice_max_days: string;
  jd_text: string;
}

const EMPTY_FORM: FormState = {
  title: "", company: "", location: "",
  ctc_min_lpa: "", ctc_max_lpa: "",
  notice_max_days: "", jd_text: "",
};

export function CreateProjectModal({ open, onClose, onCreated, editProject }: CreateProjectModalProps) {
  const isEdit = !!editProject;
  const [form, setForm] = useState<FormState>(
    isEdit
      ? {
          title: editProject.title ?? "",
          company: editProject.company ?? "",
          location: editProject.location ?? "",
          ctc_min_lpa: editProject.ctc_min_lpa?.toString() ?? "",
          ctc_max_lpa: editProject.ctc_max_lpa?.toString() ?? "",
          notice_max_days: editProject.notice_max_days?.toString() ?? "",
          jd_text: editProject.jd_text ?? "",
        }
      : EMPTY_FORM
  );
  const [loading, setLoading] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Job title is required";
    if (form.ctc_min_lpa && form.ctc_max_lpa) {
      if (Number(form.ctc_min_lpa) >= Number(form.ctc_max_lpa)) {
        errs.ctc = "Min CTC must be less than max CTC";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const payload = {
      title: form.title.trim(),
      company: form.company.trim() || undefined,
      location: form.location || undefined,
      ctc_min_lpa: form.ctc_min_lpa ? Number(form.ctc_min_lpa) : undefined,
      ctc_max_lpa: form.ctc_max_lpa ? Number(form.ctc_max_lpa) : undefined,
      notice_max_days: form.notice_max_days ? Number(form.notice_max_days) : undefined,
      jd_text: form.jd_text.trim() || undefined,
    };

    try {
      const url = isEdit ? `/api/projects/${editProject.id}` : "/api/projects";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(isEdit ? "Project updated!" : "Project created!");
      onCreated(data.project);
      if (!isEdit) setForm(EMPTY_FORM);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCities = INDIA_CITIES.filter(c =>
    c.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const inputClass = "w-full bg-[#0A0A0A] border border-[#333333] rounded-xl px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder-[#555555] focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/20 transition-all";
  const labelClass = "block text-xs font-medium text-[#A0A0A0] mb-1.5";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-lg shadow-[0_25px_80px_rgba(0,0,0,0.7)] animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1A1A1A]">
          <h2 className="text-base font-semibold text-[#FAFAFA]">
            {isEdit ? "Edit project" : "New project"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Job Title */}
          <div>
            <label className={labelClass}>
              Job title <span className="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              placeholder="Senior Backend Engineer"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={cn(inputClass, errors.title && "border-[#EF4444]")}
            />
            {errors.title && <p className="text-xs text-[#EF4444] mt-1">{errors.title}</p>}
          </div>

          {/* Company */}
          <div>
            <label className={labelClass}>Company / Client</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <input
                type="text"
                placeholder="Acme Corp (or leave blank)"
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </div>

          {/* Location */}
          <div className="relative">
            <label className={labelClass}>Location</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <input
                type="text"
                placeholder="Search city or Remote..."
                value={form.location || locationSearch}
                onChange={e => {
                  setLocationSearch(e.target.value);
                  setForm(f => ({ ...f, location: "" }));
                  setLocationOpen(true);
                }}
                onFocus={() => setLocationOpen(true)}
                className={cn(inputClass, "pl-9")}
                autoComplete="off"
              />
            </div>
            {locationOpen && filteredCities.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-[#333333] rounded-xl overflow-hidden z-10 max-h-48 overflow-y-auto shadow-xl">
                {filteredCities.map(city => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setForm(f => ({ ...f, location: city }));
                      setLocationSearch(city);
                      setLocationOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#A0A0A0] hover:bg-[#222222] hover:text-[#FAFAFA] transition-all"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CTC Range */}
          <div>
            <label className={labelClass}>CTC Range (LPA)</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#555555]">₹</span>
                <input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={999}
                  value={form.ctc_min_lpa}
                  onChange={e => setForm(f => ({ ...f, ctc_min_lpa: e.target.value }))}
                  className={cn(inputClass, "pl-7")}
                />
              </div>
              <span className="text-[#555555] text-sm">to</span>
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#555555]">₹</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={999}
                  value={form.ctc_max_lpa}
                  onChange={e => setForm(f => ({ ...f, ctc_max_lpa: e.target.value }))}
                  className={cn(inputClass, "pl-7")}
                />
              </div>
              <span className="text-xs text-[#555555] flex-shrink-0">LPA</span>
            </div>
            {errors.ctc && <p className="text-xs text-[#EF4444] mt-1">{errors.ctc}</p>}
            <p className="text-[11px] text-[#555555] mt-1.5">
              Used internally. Candidates are manually tagged with actual CTC when shortlisted.
            </p>
          </div>

          {/* Notice Period */}
          <div>
            <label className={labelClass}>Max notice period</label>
            <div className="relative">
              <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <select
                value={form.notice_max_days}
                onChange={e => setForm(f => ({ ...f, notice_max_days: e.target.value }))}
                className={cn(inputClass, "pl-9 cursor-pointer appearance-none")}
              >
                {NOTICE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-[#111111]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-[#555555] mt-1.5">
              Nexire estimates notice period from tenure. You confirm it when shortlisting.
            </p>
          </div>

          {/* JD Text */}
          <div>
            <label className={labelClass}>
              Job description
              <span className="ml-1.5 text-[10px] text-[#38BDF8] font-normal">Used by AI to rank candidates</span>
            </label>
            <textarea
              placeholder="Paste JD here — the more detail, the better the AI ranking..."
              value={form.jd_text}
              onChange={e => setForm(f => ({ ...f, jd_text: e.target.value }))}
              rows={4}
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#333333] text-sm text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#444444] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] hover:from-[#0EA5E9] hover:to-[#0284C7] text-white text-sm font-medium transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? "Saving..." : isEdit ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
FILE 2 — app/api/projects/route.ts (POST — Create Project)
typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CreateProjectSchema = z.object({
  title:           z.string().min(1).max(200),
  company:         z.string().max(200).optional(),
  location:        z.string().max(100).optional(),
  ctc_min_lpa:     z.number().min(0).max(999).optional(),
  ctc_max_lpa:     z.number().min(0).max(999).optional(),
  notice_max_days: z.number().int().min(0).max(365).optional(),
  jd_text:         z.string().max(10000).optional(),
}).refine(data => {
  if (data.ctc_min_lpa !== undefined && data.ctc_max_lpa !== undefined) {
    return data.ctc_min_lpa < data.ctc_max_lpa;
  }
  return true;
}, { message: "Min CTC must be less than Max CTC", path: ["ctc_min_lpa"] });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Get user's org_id + check plan limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, plan_tier, active_roles_count")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Check plan limit
  const ROLE_LIMITS: Record<string, number> = { free: 1, solo: 5, growth: -1, custom: -1 };
  const limit = ROLE_LIMITS[profile.plan_tier] ?? 1;
  if (limit !== -1 && profile.active_roles_count >= limit) {
    return NextResponse.json({
      error: "PLAN_LIMIT",
      message: `Your ${profile.plan_tier} plan allows ${limit} active role${limit > 1 ? "s" : ""}. Upgrade to add more.`
    }, { status: 403 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      org_id: profile.org_id,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment active_roles_count
  await supabase.from("profiles")
    .update({ active_roles_count: profile.active_roles_count + 1 })
    .eq("id", user.id);

  return NextResponse.json({ project }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, company, location, ctc_min_lpa, ctc_max_lpa, status, shortlist_count, contacted_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects });
}
FILE 3 — app/api/projects/[id]/route.ts (PATCH + DELETE)
typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const UpdateProjectSchema = z.object({
  title:           z.string().min(1).max(200).optional(),
  company:         z.string().max(200).optional(),
  location:        z.string().max(100).optional(),
  ctc_min_lpa:     z.number().min(0).max(999).optional(),
  ctc_max_lpa:     z.number().min(0).max(999).optional(),
  notice_max_days: z.number().int().min(0).max(365).optional(),
  jd_text:         z.string().max(10000).optional(),
  status:          z.enum(["active", "closed", "on_hold"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = UpdateProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: project, error } = await supabase
    .from("projects")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Decrement active_roles_count
  const { data: profile } = await supabase
    .from("profiles").select("active_roles_count").eq("id", user.id).single();
  if (profile?.active_roles_count > 0) {
    await supabase.from("profiles")
      .update({ active_roles_count: profile.active_roles_count - 1 })
      .eq("id", user.id);
  }

  return NextResponse.json({ success: true });
}
COMPLETION CHECKLIST
 CreateProjectModal.tsx — all fields, city autocomplete, CTC range, notice dropdown

 CTC note shown: "Manually tagged when shortlisting" (Prospeo doesn't have CTC)

 Notice period note shown: "Nexire estimates from tenure"

 API POST /api/projects — creates project, checks plan limits

 API PATCH /api/projects/[id] — updates project

 API DELETE /api/projects/[id] — deletes + decrements role count

 Plan limit returns 403 with PLAN_LIMIT error code (shown as upgrade prompt)

 Form validation: title required, ctc_min < ctc_max

BUILD LOG ENTRY
M02-03 Create Project Modal — [date]
Files: CreateProjectModal.tsx, api/projects/route.ts, api/projects/[id]/route.ts
Plan Limit Logic: free=1 role, solo=5, growth=-1 (unlimited)
Status: ✅ Complete