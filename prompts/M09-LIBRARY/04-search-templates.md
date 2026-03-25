<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/library.md         ← this module's API contract
-->

# M09 — TASK 04: SEARCH TEMPLATES  [ADDED — accelerates recruiter onboarding]
# Trae: Read CLAUDE.md first.
# Search Templates let recruiters save a named filter preset (skills, location,
# experience, company size etc.) and re-apply it in one click.
# Pre-built Nexire templates ship out-of-the-box for common roles.
# Route: accessed from the Search page filter bar + /search/templates
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. search_templates table (DB + RLS)
2. POST /api/search/templates — save current filters as a named template
3. GET /api/search/templates — list own + nexire preset templates
4. DELETE /api/search/templates/[id] — delete own template
5. TemplatePicker — dropdown in the search filter bar
6. SaveTemplateModal — name + optional description
7. TemplatesGallery — full page at /search/templates
8. Seed file: 10 built-in Nexire starter templates

---

## FILE 1 — Supabase SQL: search_templates table

```sql
CREATE TABLE search_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES orgs(id) ON DELETE CASCADE,
  -- org_id = NULL → Nexire built-in template (read-only for all orgs)

  created_by  UUID REFERENCES auth.users(id),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (char_length(description) <= 500),
  emoji       TEXT DEFAULT '🔍',

  -- Stored filter state (same shape as SearchFilters type)
  filters     JSONB NOT NULL DEFAULT '{}',

  -- Usage
  use_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_org        ON search_templates(org_id, is_pinned DESC, use_count DESC);
CREATE INDEX idx_templates_global     ON search_templates(org_id) WHERE org_id IS NULL;

ALTER TABLE search_templates ENABLE ROW LEVEL SECURITY;

-- Own org templates
CREATE POLICY "Org members manage own templates"
  ON search_templates
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR org_id IS NULL)
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE TRIGGER search_templates_updated_at
  BEFORE UPDATE ON search_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## FILE 2 — app/api/search/templates/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const TemplateSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  emoji:       z.string().max(4).default("🔍"),
  filters:     z.record(z.unknown()),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Fetch own org templates + built-in Nexire templates (org_id IS NULL)
  const { data: ownTemplates } = await supabase
    .from("search_templates")
    .select("id, name, description, emoji, filters, use_count, is_pinned, last_used_at, org_id, created_at")
    .eq("org_id", profile?.org_id)
    .order("is_pinned", { ascending: false })
    .order("use_count", { ascending: false });

  const { data: builtinTemplates } = await supabase
    .from("search_templates")
    .select("id, name, description, emoji, filters, use_count, is_pinned, created_at")
    .is("org_id", null)
    .order("use_count", { ascending: false });

  return NextResponse.json({
    own:     ownTemplates     ?? [],
    builtin: builtinTemplates ?? [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = TemplateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Check template name uniqueness within org
  const { data: existing } = await supabase
    .from("search_templates")
    .select("id").eq("org_id", profile?.org_id).eq("name", parsed.data.name).maybeSingle();

  if (existing) return NextResponse.json({ error: "A template with this name already exists", code: "DUPLICATE_NAME" }, { status: 409 });

  const { data: template, error: insertError } = await supabase
    .from("search_templates")
    .insert({ ...parsed.data, org_id: profile?.org_id, created_by: user.id })
    .select("id, name")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(template, { status: 201 });
}
```

---

## FILE 3 — app/api/search/templates/[id]/route.ts  (PATCH + DELETE + use)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Handle "use" action — increment counter
  if (body.action === "use") {
    await supabase.rpc("increment_template_use", { template_id: params.id });
    return NextResponse.json({ success: true });
  }

  const { error: updateError } = await supabase
    .from("search_templates")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Cannot delete built-in templates
  const { error: deleteError } = await supabase
    .from("search_templates")
    .delete()
    .eq("id", params.id)
    .eq("org_id", profile?.org_id);   // ensures org_id IS NOT NULL (built-ins protected)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — Supabase SQL: increment_template_use RPC

```sql
CREATE OR REPLACE FUNCTION increment_template_use(template_id UUID)
RETURNS void AS $$
  UPDATE search_templates
  SET use_count    = use_count + 1,
      last_used_at = NOW()
  WHERE id = template_id;
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

## FILE 5 — components/search/TemplatePicker.tsx  (dropdown in search filter bar)

```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Bookmark, ChevronDown, Star, Trash2, Pin, Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveTemplateModal } from "./SaveTemplateModal";
import { toast } from "sonner";

interface Template {
  id:          string;
  name:        string;
  description?: string;
  emoji:       string;
  filters:     Record<string, unknown>;
  use_count:   number;
  is_pinned:   boolean;
  org_id?:     string | null;
}

interface Props {
  currentFilters: Record<string, unknown>;
  onApply:        (filters: Record<string, unknown>) => void;
}

export function TemplatePicker({ currentFilters, onApply }: Props) {
  const [open, setOpen]           = useState(false);
  const [showSave, setShowSave]   = useState(false);
  const [ownList, setOwnList]     = useState<Template[]>([]);
  const [builtinList, setBuiltinList] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(false);
  const ref                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadTemplates = async () => {
    if (ownList.length || builtinList.length) return;  // cached
    setLoading(true);
    const res  = await fetch("/api/search/templates");
    const data = await res.json();
    setOwnList(data.own     ?? []);
    setBuiltinList(data.builtin ?? []);
    setLoading(false);
  };

  const handleOpen = () => { setOpen(!open); if (!open) loadTemplates(); };

  const applyTemplate = async (template: Template) => {
    onApply(template.filters);
    setOpen(false);
    toast.success(`Applied "${template.name}"`);
    // Increment use count (fire and forget)
    fetch(`/api/search/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "use" }),
    });
  };

  const togglePin = async (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/search/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: !template.is_pinned }),
    });
    setOwnList(list =>
      list.map(t => t.id === template.id ? { ...t, is_pinned: !t.is_pinned } : t)
          .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
    );
  };

  const deleteTemplate = async (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete template "${template.name}"?`)) return;
    await fetch(`/api/search/templates/${template.id}`, { method: "DELETE" });
    setOwnList(list => list.filter(t => t.id !== template.id));
    toast.success("Template deleted");
  };

  const onSaved = (template: Template) => {
    setOwnList(list => [template, ...list]);
    setShowSave(false);
    toast.success(`Template "${template.name}" saved`);
  };

  const hasFilters = Object.values(currentFilters).some(v =>
    v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all",
          open
            ? "bg-[#38BDF8]/10 border-[#38BDF8]/30 text-[#38BDF8]"
            : "bg-[#111111] border-[#222222] text-[#555555] hover:border-[#333333] hover:text-[#A0A0A0]"
        )}
      >
        <Bookmark className="w-3.5 h-3.5" />
        Templates
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-72 bg-[#111111] border border-[#222222] rounded-2xl shadow-2xl z-30 overflow-hidden">
          {/* Save current */}
          {hasFilters && (
            <div className="px-3 py-3 border-b border-[#1A1A1A]">
              <button
                onClick={() => { setShowSave(true); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-xs font-medium text-[#38BDF8] hover:bg-[#38BDF8]/20 transition-all"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Save current filters as template
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-[#555555]">Loading templates...</div>
            ) : (
              <>
                {/* Own templates */}
                {ownList.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[9px] text-[#333333] uppercase tracking-wider font-medium">
                      My templates
                    </p>
                    {ownList.map(t => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#0D0D0D] transition-colors group text-left">
                        <span className="text-base leading-none">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#A0A0A0] group-hover:text-[#FAFAFA] truncate transition-colors">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="text-[10px] text-[#333333] truncate">{t.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={(e) => togglePin(t, e)}
                            className={cn("p-1 rounded-lg transition-all",
                              t.is_pinned ? "text-yellow-400" : "text-[#333333] hover:text-[#555555]")}>
                            <Pin className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => deleteTemplate(t, e)}
                            className="p-1 rounded-lg text-[#333333] hover:text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Built-in */}
                {builtinList.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[9px] text-[#333333] uppercase tracking-wider font-medium flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-yellow-400" /> Nexire starters
                    </p>
                    {builtinList.map(t => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#0D0D0D] transition-colors group text-left">
                        <span className="text-base leading-none">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#A0A0A0] group-hover:text-[#FAFAFA] truncate transition-colors">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="text-[10px] text-[#333333] truncate">{t.description}</p>
                          )}
                        </div>
                        <span className="text-[9px] text-yellow-400/60 flex-shrink-0 font-medium">Built-in</span>
                      </button>
                    ))}
                  </div>
                )}

                {ownList.length === 0 && builtinList.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Bookmark className="w-6 h-6 text-[#222222] mx-auto mb-2" />
                    <p className="text-xs text-[#555555]">No templates yet</p>
                    <p className="text-[10px] text-[#333333] mt-1">Apply filters then save them here</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showSave && (
        <SaveTemplateModal
          filters={currentFilters}
          onClose={() => setShowSave(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
```

---

## FILE 6 — components/search/SaveTemplateModal.tsx

```tsx
"use client";
import { useState } from "react";
import { X, Bookmark } from "lucide-react";
import { toast } from "sonner";

const EMOJI_OPTIONS = ["🔍","💻","⚙️","🧑‍💼","📊","🎨","🚀","🤝","🏢","💰","🧠","📱","☁️","🔐","📦"];

interface Props {
  filters:  Record<string, unknown>;
  onClose:  () => void;
  onSaved:  (template: any) => void;
}

export function SaveTemplateModal({ filters, onClose, onSaved }: Props) {
  const [name, setName]       = useState("");
  const [desc, setDesc]       = useState("");
  const [emoji, setEmoji]     = useState("🔍");
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    const res = await fetch("/api/search/templates", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: name.trim(), description: desc.trim() || undefined, emoji, filters }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      if (data.code === "DUPLICATE_NAME") toast.error("A template with this name already exists");
      else toast.error("Failed to save template");
      return;
    }
    onSaved({ ...data, emoji, filters, use_count: 0, is_pinned: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Save search template</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-2">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all ${
                    emoji === e ? "bg-[#38BDF8]/10 border border-[#38BDF8]/30" : "bg-[#1A1A1A] border border-transparent hover:border-[#333333]"
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Name *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Senior React Engineers Mumbai"
              autoFocus
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Description</label>
            <input
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional short description..."
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[#1A1A1A]">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all">
            {saving ? "Saving..." : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 7 — supabase/seed/search-templates.sql  (10 built-in starter templates)

```sql
-- Nexire built-in search templates (org_id = NULL)
INSERT INTO search_templates (name, description, emoji, filters, org_id) VALUES

('Senior React Engineer',
 'React 5+ yrs, Mumbai or Bangalore, full-time',
 '💻',
 '{"skills":["React","TypeScript","Node.js"],"experience_min":5,"locations":["Mumbai","Bangalore"],"employment_type":"full_time"}',
 NULL),

('Data Scientist — ML Focus',
 'Python, ML/AI, Bangalore/Hyderabad',
 '🧠',
 '{"skills":["Python","Machine Learning","TensorFlow","PyTorch"],"experience_min":3,"locations":["Bangalore","Hyderabad"]}',
 NULL),

('Product Manager — B2B SaaS',
 'PM with SaaS background, 4+ yrs',
 '📊',
 '{"skills":["Product Management","B2B SaaS","Roadmap","Agile"],"experience_min":4,"company_size":["51-200","201-500","500+"]}',
 NULL),

('DevOps / SRE Engineer',
 'AWS/GCP, Kubernetes, Docker, CI/CD',
 '⚙️',
 '{"skills":["AWS","Kubernetes","Docker","Terraform","CI/CD"],"experience_min":3}',
 NULL),

('HR Business Partner',
 'HRBP with HRMS experience',
 '🤝',
 '{"skills":["HR Business Partner","HRBP","Talent Management","HRMS"],"experience_min":4,"locations":["Mumbai","Delhi","Bangalore"]}',
 NULL),

('UI/UX Designer',
 'Figma, design systems, 3+ yrs',
 '🎨',
 '{"skills":["Figma","UI Design","UX Research","Design Systems"],"experience_min":3}',
 NULL),

('Sales Manager — SaaS',
 'B2B SaaS sales, enterprise deals',
 '💰',
 '{"skills":["B2B Sales","SaaS","Enterprise Sales","CRM","Salesforce"],"experience_min":4}',
 NULL),

('Backend Engineer — Node/Go',
 'Node.js or Go, microservices, REST/gRPC',
 '🚀',
 '{"skills":["Node.js","Go","Microservices","REST API","PostgreSQL"],"experience_min":3}',
 NULL),

('Finance Controller',
 'CA / CPA, 8+ yrs, FinTech preferred',
 '📦',
 '{"skills":["Financial Reporting","CA","CPA","Compliance","IFRS"],"experience_min":8,"industries":["FinTech","Finance","BFSI"]}',
 NULL),

('Mobile Engineer — React Native',
 'Cross-platform mobile, iOS + Android',
 '📱',
 '{"skills":["React Native","iOS","Android","TypeScript","Expo"],"experience_min":3}',
 NULL);
```

---

## WIRE INTO SEARCH PAGE

In `app/(app)/search/SearchClientPage.tsx`, add to the filter bar:

```tsx
import { TemplatePicker } from "@/components/search/TemplatePicker";

// In the filter bar JSX, next to other filter buttons:
<TemplatePicker
  currentFilters={activeFilters}
  onApply={(filters) => {
    setFilters(filters);
    runSearch(filters);
  }}
/>
```

---

## COMPLETION CHECKLIST
- [ ] search_templates table: org_id nullable (NULL = built-in), filters JSONB, use_count, is_pinned
- [ ] increment_template_use SQL function
- [ ] GET /api/search/templates: returns { own[], builtin[] }
- [ ] POST /api/search/templates: name uniqueness check per org (409 DUPLICATE_NAME)
- [ ] DELETE /api/search/templates/[id]: org_id check prevents deleting built-ins
- [ ] TemplatePicker: "Save current filters" button only visible when filters are active
- [ ] TemplatePicker: Pin icon on hover, Delete icon on hover for own templates
- [ ] SaveTemplateModal: 15 emoji options, name, description
- [ ] 10 built-in Nexire starter templates seeded via SQL
- [ ] TemplatePicker wired into SearchClientPage filter bar

## BUILD LOG ENTRY
## M09-04 Search Templates — [date]
### Files: search_templates SQL, RPC, GET/POST/PATCH/DELETE API, TemplatePicker, SaveTemplateModal, seed SQL
### M09 COMPLETE ✅
### Status: ✅ Complete
