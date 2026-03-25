<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/contacts.md        ← this module's API contract
-->

# M08 — TASK 03: CONTACT IMPORT  [ADDED — essential for onboarding]
# Trae: Read CLAUDE.md first.
# New Nexire customers bring their existing contacts (CSV from HubSpot,
# Salesforce, Google Contacts, spreadsheets). This importer handles:
# field mapping, duplicate detection, DNC pre-check, preview + confirm.
# Route: /contacts/import
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build CSV contact import:
1. /contacts/import — multi-step import page
2. Step 1: Upload CSV
3. Step 2: Map CSV columns → Nexire fields
4. Step 3: Preview (first 5 rows), show duplicate + DNC warnings
5. Step 4: Confirm → bulk insert with background processing
6. POST /api/contacts/import — processes the mapped CSV
7. Import result summary (imported, skipped duplicates, DNC blocked)

---

## FILE 1 — app/(app)/contacts/import/page.tsx

```tsx
import { ContactImportWizard } from "./ContactImportWizard";
export const metadata = { title: "Import Contacts | Nexire" };
export default function ImportPage() {
  return <ContactImportWizard />;
}
```

---

## FILE 2 — app/(app)/contacts/import/ContactImportWizard.tsx

```tsx
"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowLeft, ArrowRight, CheckCircle, AlertTriangle,
         FileText, X, Info, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Install: npm install papaparse @types/papaparse

const NEXIRE_FIELDS = [
  { key: "full_name",    label: "Full Name",     required: true  },
  { key: "email",        label: "Email",          required: false },
  { key: "phone",        label: "Phone",          required: false },
  { key: "linkedin_url", label: "LinkedIn URL",   required: false },
  { key: "company",      label: "Company",        required: false },
  { key: "job_title",    label: "Job Title",      required: false },
  { key: "city",         label: "City",           required: false },
  { key: "country",      label: "Country",        required: false },
  { key: "type",         label: "Contact Type",   required: false },
  { key: "notes",        label: "Notes",          required: false },
  { key: "tags",         label: "Tags (comma-sep)",required: false },
  { key: "skip",         label: "— Skip column —",required: false },
];

type Step = "upload" | "map" | "preview" | "done";

export function ContactImportWizard() {
  const router             = useRouter();
  const [step, setStep]    = useState<Step>("upload");
  const [file, setFile]    = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows]    = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Step 1 — parse CSV
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    Papa.parse(f, {
      header:    true,
      skipEmptyLines: true,
      preview:   200,  // parse first 200 rows for preview
      complete:  (result) => {
        const parsedHeaders = result.meta.fields ?? [];
        setHeaders(parsedHeaders);
        setRows(result.data as Record<string, string>[]);
        // Auto-guess column mapping
        const autoMap: Record<string, string> = {};
        parsedHeaders.forEach(h => {
          const normalized = h.toLowerCase().replace(/[\s_-]/g, "");
          const match = NEXIRE_FIELDS.find(f =>
            normalized.includes(f.key.replace("_","")) ||
            (f.key === "full_name" && (normalized.includes("name") || normalized.includes("fullname"))) ||
            (f.key === "job_title" && (normalized.includes("title") || normalized.includes("position"))) ||
            (f.key === "company"   && normalized.includes("compan"))
          );
          autoMap[h] = match?.key ?? "skip";
        });
        setMapping(autoMap);
        setStep("map");
      },
      error: () => toast.error("Failed to parse CSV. Please check the file format."),
    });
  }, []);

  // Step 3 — preview: apply mapping to first 5 rows
  const previewRows = rows.slice(0, 5).map(row => {
    const mapped: Record<string, string> = {};
    headers.forEach(h => {
      const field = mapping[h];
      if (field && field !== "skip") mapped[field] = row[h] ?? "";
    });
    return mapped;
  });

  const mappedCount = Object.values(mapping).filter(v => v !== "skip").length;
  const hasName     = Object.values(mapping).includes("full_name");

  // Step 4 — import
  const runImport = async () => {
    setImporting(true);
    // Map ALL rows
    const allMapped = rows.map(row => {
      const mapped: Record<string, string> = {};
      headers.forEach(h => {
        const field = mapping[h];
        if (field && field !== "skip") mapped[field] = row[h] ?? "";
      });
      return mapped;
    }).filter(r => r.full_name?.trim());

    const res  = await fetch("/api/contacts/import", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ contacts: allMapped }),
    });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) { toast.error("Import failed"); return; }
    setResult(data);
    setStep("done");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => step === "upload" ? router.push("/contacts") : setStep(
          step === "map" ? "upload" : step === "preview" ? "map" : "upload"
        )}
        className="flex items-center gap-2 text-sm text-[#555555] hover:text-[#A0A0A0] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === "upload" ? "Back to Contacts" : "Back"}
      </button>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload","map","preview","done"] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
              step === s ? "bg-[#38BDF8] text-white" :
              ["upload","map","preview","done"].indexOf(step) > idx ? "bg-green-400 text-white" :
              "bg-[#1A1A1A] text-[#555555]"
            )}>
              {["upload","map","preview","done"].indexOf(step) > idx
                ? <CheckCircle className="w-3.5 h-3.5" />
                : idx + 1}
            </div>
            <span className={cn("text-xs", step === s ? "text-[#FAFAFA]" : "text-[#555555]")}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {idx < 3 && <div className="w-8 h-px bg-[#222222]" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA] mb-1">Import contacts</h1>
          <p className="text-sm text-[#555555] mb-6">Upload a CSV file from HubSpot, Salesforce, Google Contacts, or Excel.</p>

          <label className="block cursor-pointer">
            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            <div className="border-2 border-dashed border-[#222222] hover:border-[#38BDF8]/50 rounded-2xl p-12 text-center transition-all group">
              <Upload className="w-10 h-10 text-[#333333] group-hover:text-[#38BDF8]/50 mx-auto mb-3 transition-colors" />
              <p className="text-sm text-[#555555] mb-1">Click to upload or drag & drop</p>
              <p className="text-xs text-[#333333]">CSV files only · Max 10MB · Up to 5,000 contacts</p>
            </div>
          </label>

          <div className="mt-5 bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4">
            <p className="text-xs font-medium text-[#A0A0A0] mb-2">Expected CSV columns (any order):</p>
            <p className="text-[11px] text-[#555555] font-mono">
              Full Name, Email, Phone, LinkedIn URL, Company, Job Title, City, Country, Tags, Notes
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Map columns ── */}
      {step === "map" && (
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA] mb-1">Map columns</h1>
          <p className="text-sm text-[#555555] mb-1">{rows.length} rows found in <span className="text-[#A0A0A0]">{file?.name}</span></p>
          <p className="text-xs text-[#555555] mb-5">
            Auto-mapped {mappedCount} of {headers.length} columns. Adjust as needed.
          </p>

          {!hasName && (
            <div className="flex items-center gap-2 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2.5 mb-4">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">You must map a column to "Full Name" to continue.</p>
            </div>
          )}

          <div className="space-y-2">
            {headers.map(header => (
              <div key={header} className="flex items-center gap-3 bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-[#A0A0A0]">{header}</p>
                  <p className="text-[10px] text-[#333333] mt-0.5 truncate">
                    e.g. {rows[0]?.[header] ?? "—"}
                  </p>
                </div>
                <div className="text-[#333333] text-sm">→</div>
                <select
                  value={mapping[header] ?? "skip"}
                  onChange={e => setMapping(m => ({ ...m, [header]: e.target.value }))}
                  className="bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2 text-xs text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none min-w-[160px]"
                >
                  {NEXIRE_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep("preview")}
            disabled={!hasName}
            className="mt-5 flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium disabled:opacity-50 hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
          >
            Preview import <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── STEP 3: Preview ── */}
      {step === "preview" && (
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA] mb-1">Preview</h1>
          <p className="text-sm text-[#555555] mb-5">
            First 5 of <span className="text-[#A0A0A0] font-medium">{rows.length.toLocaleString()}</span> contacts. Looks good?
          </p>

          <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  {NEXIRE_FIELDS.filter(f => f.key !== "skip" && Object.values(mapping).includes(f.key)).map(f => (
                    <th key={f.key} className="px-4 py-3 text-left text-[10px] text-[#555555] uppercase tracking-wider">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-[#0D0D0D]">
                    {NEXIRE_FIELDS.filter(f => f.key !== "skip" && Object.values(mapping).includes(f.key)).map(f => (
                      <td key={f.key} className="px-4 py-3 text-[#A0A0A0] truncate max-w-[140px]">
                        {row[f.key] || <span className="text-[#333333]">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 mb-5">
            <Info className="w-3.5 h-3.5 text-[#555555] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#555555]">
              Duplicates (same email already exists) will be skipped.
              Contacts matching your DNC list will be imported as "Do Not Contact".
              Tags separated by commas will be split into individual tags.
            </p>
          </div>

          <button
            onClick={runImport}
            disabled={importing}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing {rows.length} contacts...</>
              : <>Import {rows.length.toLocaleString()} contacts <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === "done" && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-2xl bg-green-400/10 border border-green-400/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-[#FAFAFA] mb-2">Import complete</h1>
          <p className="text-sm text-[#555555] mb-6">Here's a summary of what happened:</p>

          <div className="grid grid-cols-3 gap-3 mb-6 max-w-md mx-auto">
            {[
              { label: "Imported",  value: result.imported,  color: "text-green-400" },
              { label: "Skipped (duplicates)", value: result.skipped, color: "text-yellow-400" },
              { label: "DNC blocked", value: result.dnc_blocked, color: "text-red-400" },
            ].map(s => (
              <div key={s.label} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-[10px] text-[#555555] mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push("/contacts")}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
          >
            View contacts
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## FILE 3 — app/api/contacts/import/route.ts  (bulk insert)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkCheckDNC } from "@/lib/compliance/dnc-check";

interface ImportedContact {
  full_name:    string;
  email?:       string;
  phone?:       string;
  company?:     string;
  job_title?:   string;
  city?:        string;
  country?:     string;
  linkedin_url?:string;
  type?:        string;
  notes?:       string;
  tags?:        string;   // comma-separated from CSV
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contacts }: { contacts: ImportedContact[] } = await req.json();
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }
  if (contacts.length > 5000) {
    return NextResponse.json({ error: "Max 5,000 contacts per import" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  const orgId = profile?.org_id;

  // Fetch existing emails in org to detect duplicates
  const inputEmails   = contacts.map(c => c.email?.toLowerCase()).filter(Boolean) as string[];
  const { data: existingEmails } = await supabase
    .from("contacts")
    .select("email")
    .eq("org_id", orgId)
    .in("email", inputEmails);
  const existingSet = new Set((existingEmails ?? []).map(e => e.email?.toLowerCase()));

  // Bulk DNC check
  const dncBlocked = await bulkCheckDNC(orgId, inputEmails);

  let imported    = 0;
  let skipped     = 0;
  let dnc_blocked = 0;

  // Process in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk    = contacts.slice(i, i + CHUNK_SIZE);
    const toInsert = [];

    for (const c of chunk) {
      if (!c.full_name?.trim()) { skipped++; continue; }

      const email = c.email?.toLowerCase().trim() || null;

      // Skip duplicates
      if (email && existingSet.has(email)) { skipped++; continue; }

      // DNC check
      const isDNC  = email ? dncBlocked.has(email) : false;

      // Parse tags
      const tags   = c.tags
        ? c.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      toInsert.push({
        org_id:       orgId,
        created_by:   user.id,
        full_name:    c.full_name.trim(),
        email:        email,
        phone:        c.phone?.trim() || null,
        linkedin_url: c.linkedin_url?.trim() || null,
        company:      c.company?.trim() || null,
        job_title:    c.job_title?.trim() || null,
        city:         c.city?.trim() || null,
        country:      c.country?.trim() || "IN",
        type:         ["client","hiring_manager","hr","agency","other"].includes(c.type ?? "")
                       ? c.type : "client",
        status:       isDNC ? "do_not_contact" : "active",
        tags,
        notes:        c.notes?.trim() || null,
        source:       "import",
      });

      if (isDNC) dnc_blocked++;
      else imported++;

      if (email) existingSet.add(email);
    }

    if (toInsert.length > 0) {
      await supabase.from("contacts").insert(toInsert);
    }
  }

  return NextResponse.json({ imported, skipped, dnc_blocked, total: contacts.length });
}
```

---

## INSTALL DEPENDENCY
```bash
npm install papaparse @types/papaparse
```

---

## COMPLETION CHECKLIST
- [ ] papaparse installed for client-side CSV parsing
- [ ] Step 1 Upload: drag/drop CSV, auto-parses with PapaParse, shows row count
- [ ] Step 2 Map: auto-guesses column mappings, manual overrides, "Skip column" option
- [ ] "Full Name required" guard prevents advancing without name mapping
- [ ] Step 3 Preview: first 5 rows in table, DNC/duplicate info banner
- [ ] POST /api/contacts/import: max 5,000 contacts, chunked inserts (100/batch)
- [ ] Duplicate detection: existing org emails fetched, skipped
- [ ] DNC check: bulkCheckDNC() pre-filters, DNC contacts imported as "do_not_contact"
- [ ] Tags: comma-separated string split into array
- [ ] Step 4 Done: shows imported / skipped / dnc_blocked counts
- [ ] "Import" button in /contacts header links to this page

## BUILD LOG ENTRY
## M08-03 Contact Import — [date]
### Files: ContactImportWizard (4-step), POST /api/contacts/import, papaparse integration
### Status: ✅ Complete
