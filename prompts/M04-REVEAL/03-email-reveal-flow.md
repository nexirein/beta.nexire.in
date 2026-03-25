<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 03: EMAIL REVEAL FLOW
# Trae: Read CLAUDE.md first.
# The full end-to-end email reveal: UI button → API call → credit deduction →
# Prospeo lookup → DB upsert → return email to frontend.
# This is the MOST revenue-critical user interaction in Nexire.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the complete email reveal flow:
1. EmailRevealButton component (3 states: locked / loading / revealed)
2. POST /api/reveal/email route (separate from the search reveal)
3. Integration into CandidateSlideOver contact tab
4. Idempotency: if already revealed, return cached FREE (no credit deduction)
5. Error states: NO_EMAIL_FOUND, INSUFFICIENT_CREDITS, SERVICE_ERROR

---

## DESIGN SPEC
Locked state:    full-width gradient button "Reveal email · 1 credit"
Loading state:   spinner + "Revealing..." disabled
Revealed state:  email address + copy icon + mailto icon + green "Verified" badge
No email found:  muted text "No email found for this profile"
Error state:     red-bordered box with error message

---

## FILE 1 — components/reveal/EmailRevealButton.tsx

```tsx
"use client";
import { useState } from "react";
import { Mail, Eye, Loader2, Copy, Check, ExternalLink, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type RevealState = "locked" | "loading" | "revealed" | "not_found" | "error";

interface EmailRevealButtonProps {
  candidate: {
    linkedin_url: string;
    candidate_id: string | null;
    is_revealed: boolean;
    email: string | null;
    email_status?: "VERIFIED" | "ACCEPT_ALL" | "UNKNOWN" | null;
  };
  creditsBalance: number;
  onReveal: (data: {
    email: string | null;
    phone: string | null;
    candidate_id: string;
    email_status: string | null;
  }) => void;
  onCreditDeducted?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  VERIFIED:   { label: "Verified",    className: "text-green-400 bg-green-400/10" },
  ACCEPT_ALL: { label: "Accept-all",  className: "text-yellow-400 bg-yellow-400/10" },
  UNKNOWN:    { label: "Unverified",  className: "text-[#555555] bg-[#1A1A1A]" },
};

export function EmailRevealButton({
  candidate, creditsBalance, onReveal, onCreditDeducted,
}: EmailRevealButtonProps) {
  const [state, setState] = useState<RevealState>(
    candidate.is_revealed
      ? candidate.email ? "revealed" : "not_found"
      : "locked"
  );
  const [email, setEmail]           = useState<string | null>(candidate.email);
  const [emailStatus, setEmailStatus] = useState(candidate.email_status ?? null);
  const [copied, setCopied]         = useState(false);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const handleReveal = async () => {
    if (state !== "locked") return;

    if (creditsBalance < 1) {
      toast.error("Insufficient credits", {
        description: "Top up to continue revealing contact info.",
        action: { label: "Top up →", onClick: () => (window.location.href = "/billing") },
      });
      return;
    }

    setState("loading");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/reveal/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: candidate.linkedin_url }),
      });
      const data = await res.json();

      if (!res.ok) {
        switch (data.error) {
          case "NO_EMAIL_FOUND":
            setState("not_found");
            toast.info("No email found — no credit was deducted.");
            return;
          case "INSUFFICIENT_CREDITS":
            setState("locked");
            toast.error("Insufficient credits");
            return;
          case "SERVICE_ERROR":
          case "NETWORK_ERROR":
            setState("error");
            setErrorMsg("Service temporarily unavailable. Please try again.");
            return;
          default:
            setState("error");
            setErrorMsg(data.message ?? "Reveal failed. Please try again.");
            return;
        }
      }

      // Success
      setEmail(data.email);
      setEmailStatus(data.email_status);
      setState(data.email ? "revealed" : "not_found");
      onReveal({
        email:        data.email,
        phone:        data.phone,
        candidate_id: data.candidate_id,
        email_status: data.email_status,
      });
      onCreditDeducted?.();

      if (data.cached) {
        toast.success("Email loaded from cache (no credit used)");
      } else if (data.email) {
        toast.success("Email revealed!");
      } else {
        toast.info("No email found for this profile.");
      }
    } catch {
      setState("error");
      setErrorMsg("Network error. Please check your connection.");
    }
  };

  const copyEmail = async () => {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const badge = emailStatus ? STATUS_BADGE[emailStatus] : null;

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200",
      state === "revealed"   ? "bg-[#111111] border-green-400/20" :
      state === "error"      ? "bg-[#111111] border-[#EF4444]/30" :
      state === "not_found"  ? "bg-[#111111] border-[#222222]" :
                               "bg-[#111111] border-[#222222]"
    )}>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center",
          state === "revealed" ? "bg-green-400/10" : "bg-[#1A1A1A]"
        )}>
          <Mail className={cn("w-3.5 h-3.5", state === "revealed" ? "text-green-400" : "text-[#555555]")} />
        </div>
        <span className="text-xs font-medium text-[#A0A0A0]">Email address</span>
        {badge && state === "revealed" && (
          <span className={cn("ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium", badge.className)}>
            {badge.label === "Verified" && <ShieldCheck className="w-2.5 h-2.5" />}
            {badge.label}
          </span>
        )}
      </div>

      {/* States */}
      {state === "locked" && (
        <button
          onClick={handleReveal}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all shadow-glow-blue-sm"
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal email · 1 credit
        </button>
      )}

      {state === "loading" && (
        <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1A1A1A] text-[#555555] text-sm cursor-not-allowed">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Revealing...
        </div>
      )}

      {state === "revealed" && email && (
        <div className="flex items-center gap-2">
          <a
            href={`mailto:${email}`}
            className="flex-1 text-sm text-[#38BDF8] hover:text-[#0EA5E9] hover:underline truncate transition-colors"
          >
            {email}
          </a>
          <button
            onClick={copyEmail}
            title="Copy email"
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-green-400" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={`mailto:${email}`}
            title="Send email"
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {state === "not_found" && (
        <p className="text-xs text-[#555555] py-1">No email found for this profile</p>
      )}

      {state === "error" && (
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-[#EF4444] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-[#EF4444]">{errorMsg}</p>
            <button
              onClick={() => { setState("locked"); setErrorMsg(null); }}
              className="text-[11px] text-[#555555] hover:text-[#A0A0A0] mt-1 underline transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## FILE 2 — app/api/reveal/email/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupLinkedInContact } from "@/lib/prospeo/client";
import { deductCredit } from "@/lib/supabase/credits";
import { z } from "zod";

const Schema = z.object({
  linkedin_url: z.string().url(),
});

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Validate ────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid linkedin_url" }, { status: 400 });
  }

  // Normalise URL
  const linkedinUrl = parsed.data.linkedin_url.split("?")[0].replace(/\/$/, "");

  // ── Idempotency cache check ─────────────────────────────
  const { data: cached } = await supabase
    .from("candidates")
    .select("id, email, phone, email_verification_status")
    .eq("linkedin_url", linkedinUrl)
    .eq("revealed_by", user.id)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      email:        cached.email,
      phone:        cached.phone,
      candidate_id: cached.id,
      email_status: cached.email_verification_status,
      cached:       true,
    });
  }

  // ── Credit balance check ────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance, org_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.credits_balance < 1) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS" },
      { status: 402 }
    );
  }

  // ── Prospeo lookup ──────────────────────────────────────
  const result = await lookupLinkedInContact(linkedinUrl);

  if (result.error === "NOT_FOUND") {
    return NextResponse.json({ error: "NO_EMAIL_FOUND" }, { status: 404 });
  }
  if (result.error === "DAILY_LIMIT") {
    return NextResponse.json(
      { error: "SERVICE_LIMIT", message: "Daily search limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }
  if (result.error) {
    return NextResponse.json({ error: "SERVICE_ERROR" }, { status: 503 });
  }

  // No data found — no credit deduction
  if (!result.email && !result.phone) {
    return NextResponse.json({ error: "NO_EMAIL_FOUND" }, { status: 404 });
  }

  // ── Atomic: upsert candidate + deduct credit ────────────
  const { data: candidate, error: upsertError } = await supabase
    .from("candidates")
    .upsert({
      org_id:                    profile.org_id,
      linkedin_url:              linkedinUrl,
      email:                     result.email,
      phone:                     result.phone,
      email_verification_status: result.emailStatus,
      revealed_by:               user.id,
      revealed_at:               new Date().toISOString(),
    }, { onConflict: "linkedin_url" })
    .select("id")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  // Deduct 1 credit via atomic RPC
  try {
    await deductCredit(user.id, {
      amount:      1,
      action_type: "reveal_email",
      ref_id:      candidate.id,
      ref_type:    "candidate",
      metadata:    { linkedin_url: linkedinUrl },
    });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_CREDITS") {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    return NextResponse.json({ error: "CREDIT_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    email:        result.email,
    phone:        result.phone,
    candidate_id: candidate.id,
    email_status: result.emailStatus,
    cached:       false,
  });
}
```

---

## COMPLETION CHECKLIST
- [ ] EmailRevealButton — 5 states: locked / loading / revealed / not_found / error
- [ ] Email status badge: "Verified" (green), "Accept-all" (yellow), "Unverified" (grey)
- [ ] Copy button copies email to clipboard with toast
- [ ] Mailto link in revealed state
- [ ] POST /api/reveal/email — idempotency check → credit check → Prospeo → upsert → deduct
- [ ] NO_EMAIL_FOUND returns 404 with NO credit deducted
- [ ] Cached reveals are FREE (200 with cached: true)
- [ ] Try again button shown on error state

## BUILD LOG ENTRY
## M04-03 Email Reveal Flow — [date]
### Files: EmailRevealButton.tsx, api/reveal/email/route.ts
### Status: ✅ Complete
