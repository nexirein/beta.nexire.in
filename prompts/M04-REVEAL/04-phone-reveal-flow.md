<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 04: PHONE REVEAL FLOW
# Trae: Read CLAUDE.md first.
# Phone reveal is triggered SEPARATELY from email reveal (different credit event).
# However, Prospeo returns both email + phone in a single API call.
# Strategy: if email was already revealed, phone is FREE (already in DB).
# If only phone is requested without prior email reveal → 1 credit deduction.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the phone reveal flow:
1. PhoneRevealButton component (states: locked / loading / revealed / not_found)
2. POST /api/reveal/phone route
3. Smart logic: if candidate already has phone in DB → return FREE
4. If phone not in DB but email was just revealed → phone was already fetched, just return it FREE
5. Only charge 1 credit if phone was NOT fetched in any prior reveal for this candidate
6. Show click-to-call link + copy button when revealed
7. Show "Included in email reveal" note if both were fetched together

---

## DESIGN SPEC
Same card style as EmailRevealButton (bg-[#111111] border rounded-xl p-4)
Icon: Phone (lucide)
Revealed: phone number + click-to-call anchor tel: + copy button
Locked: "Reveal phone · 1 credit" OR "Included with email reveal" (FREE if already in DB)
Country flag: Show 🇮🇳 for +91 numbers

---

## FILE 1 — components/reveal/PhoneRevealButton.tsx

```tsx
"use client";
import { useState } from "react";
import { Phone, Eye, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PhoneState = "locked" | "loading" | "revealed" | "not_found" | "free_with_email" | "error";

interface PhoneRevealButtonProps {
  candidate: {
    linkedin_url: string;
    candidate_id: string | null;
    is_revealed: boolean;       // email was revealed
    phone: string | null;       // if already in DB from email reveal
  };
  creditsBalance: number;
  onReveal: (phone: string | null) => void;
  onCreditDeducted?: () => void;
}

function getCountryFlag(phone: string): string {
  if (phone.startsWith("+91")) return "🇮🇳";
  if (phone.startsWith("+1"))  return "🇺🇸";
  if (phone.startsWith("+44")) return "🇬🇧";
  if (phone.startsWith("+61")) return "🇦🇺";
  if (phone.startsWith("+65")) return "🇸🇬";
  return "📞";
}

function formatPhone(phone: string): string {
  // Format Indian mobile: +91 98765 43210
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.startsWith("+91") && cleaned.length === 13) {
    return `+91 ${cleaned.slice(3, 8)} ${cleaned.slice(8)}`;
  }
  return phone;
}

export function PhoneRevealButton({
  candidate, creditsBalance, onReveal, onCreditDeducted,
}: PhoneRevealButtonProps) {
  // If phone already in DB (fetched during email reveal) → show as free
  const hasPhoneInDB = candidate.is_revealed && candidate.phone;

  const [state, setState] = useState<PhoneState>(() => {
    if (hasPhoneInDB) return "revealed";
    if (candidate.is_revealed && !candidate.phone) return "not_found";
    return "locked";
  });

  const [phone, setPhone]   = useState<string | null>(candidate.phone);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReveal = async () => {
    if (state !== "locked") return;

    if (creditsBalance < 1) {
      toast.error("Insufficient credits", {
        action: { label: "Top up →", onClick: () => (window.location.href = "/billing") },
      });
      return;
    }

    setState("loading");
    try {
      const res = await fetch("/api/reveal/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: candidate.linkedin_url }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "NO_PHONE_FOUND") {
          setState("not_found");
          toast.info("No phone number found — no credit deducted.");
          return;
        }
        if (data.error === "INSUFFICIENT_CREDITS") {
          setState("locked");
          toast.error("Insufficient credits");
          return;
        }
        setState("error");
        setErrorMsg(data.message ?? "Reveal failed. Please try again.");
        return;
      }

      setPhone(data.phone);
      setState(data.phone ? "revealed" : "not_found");
      onReveal(data.phone);

      if (data.cached || data.free) {
        toast.success("Phone retrieved (no credit used)");
      } else if (data.phone) {
        toast.success("Phone revealed!");
        onCreditDeducted?.();
      } else {
        toast.info("No phone found for this profile.");
      }
    } catch {
      setState("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const copyPhone = async () => {
    if (!phone) return;
    await navigator.clipboard.writeText(phone);
    setCopied(true);
    toast.success("Phone number copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200",
      state === "revealed"  ? "bg-[#111111] border-green-400/20" :
      state === "error"     ? "bg-[#111111] border-[#EF4444]/30" :
                              "bg-[#111111] border-[#222222]"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center",
          state === "revealed" ? "bg-green-400/10" : "bg-[#1A1A1A]"
        )}>
          <Phone className={cn("w-3.5 h-3.5", state === "revealed" ? "text-green-400" : "text-[#555555]")} />
        </div>
        <span className="text-xs font-medium text-[#A0A0A0]">Phone number</span>
        {state === "revealed" && (
          <span className="ml-auto text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-md font-medium">
            Revealed
          </span>
        )}
      </div>

      {/* States */}
      {state === "locked" && (
        <div className="space-y-2">
          <button
            onClick={handleReveal}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all shadow-glow-blue-sm"
          >
            <Eye className="w-3.5 h-3.5" />
            Reveal phone · 1 credit
          </button>
          {candidate.is_revealed && (
            <p className="text-[10px] text-[#555555] text-center">
              Phone not found during email reveal. Retry with dedicated phone lookup.
            </p>
          )}
        </div>
      )}

      {state === "loading" && (
        <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1A1A1A] text-[#555555] text-sm cursor-not-allowed">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Looking up phone...
        </div>
      )}

      {state === "revealed" && phone && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{getCountryFlag(phone)}</span>
            <a
              href={`tel:${phone}`}
              className="flex-1 text-sm font-medium text-[#FAFAFA] hover:text-[#38BDF8] transition-colors"
            >
              {formatPhone(phone)}
            </a>
            <button
              onClick={copyPhone}
              title="Copy number"
              className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-green-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-green-400/20 text-green-400 text-xs font-medium hover:bg-green-400/5 transition-all"
          >
            <Phone className="w-3 h-3" />
            Call now
          </a>
        </div>
      )}

      {state === "not_found" && (
        <p className="text-xs text-[#555555] py-1">No phone number found for this profile</p>
      )}

      {state === "error" && (
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-[#EF4444] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-[#EF4444]">{errorMsg}</p>
            <button
              onClick={() => { setState("locked"); setErrorMsg(null); }}
              className="text-[11px] text-[#555555] hover:text-[#A0A0A0] mt-1 underline"
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

## FILE 2 — app/api/reveal/phone/route.ts

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
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid linkedin_url" }, { status: 400 });
  }

  const linkedinUrl = parsed.data.linkedin_url.split("?")[0].replace(/\/$/, "");

  // ── Check if phone already in DB (from prior email reveal) ─
  const { data: existingCandidate } = await supabase
    .from("candidates")
    .select("id, phone, email")
    .eq("linkedin_url", linkedinUrl)
    .eq("revealed_by", user.id)
    .maybeSingle();

  // Phone already fetched — return FREE
  if (existingCandidate?.phone) {
    return NextResponse.json({
      phone:        existingCandidate.phone,
      candidate_id: existingCandidate.id,
      free:         true,
      cached:       true,
    });
  }

  // ── Credit check ───────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();

  if (!profile || profile.credits_balance < 1) {
    return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }

  // ── Prospeo lookup ─────────────────────────────────────────
  const result = await lookupLinkedInContact(linkedinUrl);

  if (result.error === "NOT_FOUND" || (!result.phone && !result.email)) {
    return NextResponse.json({ error: "NO_PHONE_FOUND" }, { status: 404 });
  }
  if (result.error) {
    return NextResponse.json({ error: "SERVICE_ERROR" }, { status: 503 });
  }
  if (!result.phone) {
    return NextResponse.json({ error: "NO_PHONE_FOUND" }, { status: 404 });
  }

  // ── Update/upsert candidate with phone ─────────────────────
  const { data: candidate } = await supabase
    .from("candidates")
    .upsert({
      linkedin_url: linkedinUrl,
      phone:        result.phone,
      revealed_by:  user.id,
      revealed_at:  new Date().toISOString(),
    }, { onConflict: "linkedin_url" })
    .select("id")
    .single();

  // ── Deduct 1 credit ────────────────────────────────────────
  try {
    await deductCredit(user.id, {
      amount:      1,
      action_type: "reveal_phone",
      ref_id:      candidate?.id,
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
    phone:        result.phone,
    candidate_id: candidate?.id,
    free:         false,
    cached:       false,
  });
}
```

---

## COMPLETION CHECKLIST
- [ ] PhoneRevealButton — states: locked / loading / revealed / not_found / error
- [ ] If phone already in DB (from email reveal) → shown FREE, no button needed
- [ ] Country flag shown for +91, +1, +44, +61, +65
- [ ] formatPhone: formats +91 numbers as "+91 XXXXX XXXXX"
- [ ] "Call now" button (tel: link) shown below phone number
- [ ] POST /api/reveal/phone — checks DB first (free), then Prospeo, then deducts
- [ ] NO_PHONE_FOUND = 404, no credit deducted
- [ ] Phone from prior email reveal = FREE (cached: true, free: true)

## BUILD LOG ENTRY
## M04-04 Phone Reveal Flow — [date]
### Files: PhoneRevealButton.tsx, api/reveal/phone/route.ts
### Status: ✅ Complete
