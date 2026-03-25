<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 06: REVEAL API — Credit Deduction + Prospeo Contact Lookup
# Trae: Read CLAUDE.md first. This is the CORE revenue-critical backend.
# Every credit deduction flows through this route.
# Use DB transaction + idempotency check to prevent double-charging.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build POST /api/reveal that:
1. Auth check
2. Check candidate not already revealed (return cached data if yes — FREE, no credit deduction)
3. Check credits_balance >= 1 (return 402 if not)
4. Call Prospeo /email-finder API with LinkedIn URL
5. If email/phone found → deduct 1 credit, upsert candidate row, store reveal record
6. If NOT found → return NO_CONTACT_FOUND error, DO NOT deduct credit
7. All DB writes in a single Supabase RPC call (atomic)

---

## PROSPEO API SPEC (READ CAREFULLY)

Base URL: https://api.prospeo.io
Endpoint: POST /email-finder
Headers:
  Content-Type: application/json
  X-KEY: [PROSPEO_API_KEY from env]

Request body:
  { "url": "https://www.linkedin.com/in/username" }

Success response shape:
{
  "error": false,
  "email": {
    "value": "name@company.com",
    "status": "VERIFIED" | "ACCEPT_ALL" | "UNKNOWN"
  },
  "mobile_number": {
    "value": "+91XXXXXXXXXX"
  }
}

Error cases:
  - { "error": true, "message": "PROFILE_NOT_FOUND" }
  - { "error": true, "message": "NO_EMAIL_FOUND" }
  - { "error": true, "message": "DAILY_LIMIT" }
  - HTTP 401: invalid API key

IMPORTANT: Only deduct credits if email.value OR mobile_number.value is present.
If both are null/missing → return error code NO_CONTACT_FOUND, no credit deducted.

---

## FILE 1 — app/api/reveal/route.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RevealSchema = z.object({
  linkedin_url: z.string().url().includes("linkedin.com/in/"),
  prospeo_id:   z.string().optional(), // used for idempotency cache key
});

export async function POST(req: NextRequest) {
  // ─── 1. Auth ───────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── 2. Validate input ─────────────────────────────────────
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = RevealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { linkedin_url } = parsed.data;

  // Normalise LinkedIn URL (remove trailing slash, query params)
  const normalised_url = linkedin_url.split("?")[0].replace(/\/$/, "");

  // ─── 3. Check already revealed (idempotency cache) ─────────
  const { data: existing } = await supabase
    .from("candidates")
    .select("id, email, phone, full_name")
    .eq("linkedin_url", normalised_url)
    .eq("revealed_by", user.id)
    .maybeSingle();

  if (existing && (existing.email || existing.phone)) {
    // Return cached — FREE, no credit deduction
    return NextResponse.json({
      email:        existing.email,
      phone:        existing.phone,
      candidate_id: existing.id,
      cached:       true,
    });
  }

  // ─── 4. Check credit balance ───────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance, org_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.credits_balance < 1) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", message: "You need at least 1 credit to reveal contact info." },
      { status: 402 }
    );
  }

  // ─── 5. Call Prospeo API ───────────────────────────────────
  let prospeoEmail: string | null = null;
  let prospeoPhone: string | null = null;
  let prospeoStatus: string | null = null;

  try {
    const prospeoRes = await fetch("https://api.prospeo.io/email-finder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": process.env.PROSPEO_API_KEY!,
      },
      body: JSON.stringify({ url: normalised_url }),
    });

    if (!prospeoRes.ok) {
      if (prospeoRes.status === 401) {
        console.error("[Reveal] Prospeo API key invalid");
        return NextResponse.json({ error: "SERVICE_ERROR" }, { status: 503 });
      }
      return NextResponse.json({ error: "PROSPEO_ERROR" }, { status: 502 });
    }

    const prospeoData = await prospeoRes.json();

    if (prospeoData.error === true) {
      const msg = prospeoData.message ?? "";
      if (msg === "DAILY_LIMIT") {
        return NextResponse.json({ error: "SERVICE_LIMIT", message: "Daily limit reached. Try again tomorrow." }, { status: 429 });
      }
      // PROFILE_NOT_FOUND or NO_EMAIL_FOUND — no credit deduction
      return NextResponse.json({ error: "NO_CONTACT_FOUND" }, { status: 404 });
    }

    prospeoEmail  = prospeoData.email?.value ?? null;
    prospeoPhone  = prospeoData.mobile_number?.value ?? null;
    prospeoStatus = prospeoData.email?.status ?? null;

    // If truly no data found — no credit deduction
    if (!prospeoEmail && !prospeoPhone) {
      return NextResponse.json({ error: "NO_CONTACT_FOUND" }, { status: 404 });
    }
  } catch (fetchErr) {
    console.error("[Reveal] Prospeo fetch failed:", fetchErr);
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 503 });
  }

  // ─── 6. Atomic DB write: deduct credit + upsert candidate + log reveal ───
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc("reveal_contact", {
      p_user_id:      user.id,
      p_org_id:       profile.org_id,
      p_linkedin_url: normalised_url,
      p_email:        prospeoEmail,
      p_phone:        prospeoPhone,
      p_email_status: prospeoStatus,
    });

    if (rpcError) {
      console.error("[Reveal] RPC error:", rpcError);
      // Specific check: race condition / already deducted
      if (rpcError.message.includes("insufficient_credits")) {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
      }
      return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
    }

    return NextResponse.json({
      email:        prospeoEmail,
      phone:        prospeoPhone,
      candidate_id: rpcResult.candidate_id,
      cached:       false,
    });
  } catch (dbErr) {
    console.error("[Reveal] DB write failed:", dbErr);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
```

---

## FILE 2 — Supabase RPC: reveal_contact (SQL)

Run this in Supabase SQL Editor. This function is ATOMIC — either all writes succeed or all roll back.

```sql
CREATE OR REPLACE FUNCTION reveal_contact(
  p_user_id      UUID,
  p_org_id       UUID,
  p_linkedin_url TEXT,
  p_email        TEXT,
  p_phone        TEXT,
  p_email_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_candidate_id   UUID;
  v_current_bal    INTEGER;
  v_credit_log_id  UUID;
BEGIN
  -- Lock the profile row for update (prevents race conditions)
  SELECT credits_balance INTO v_current_bal
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_bal < 1 THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  -- Upsert candidate (insert if not exists, update email/phone if exists)
  INSERT INTO candidates (
    org_id, linkedin_url, email, phone,
    email_verification_status, revealed_by,
    revealed_at, reveal_count
  )
  VALUES (
    p_org_id, p_linkedin_url, p_email, p_phone,
    p_email_status, p_user_id,
    NOW(), 1
  )
  ON CONFLICT (linkedin_url) DO UPDATE SET
    email                    = COALESCE(EXCLUDED.email, candidates.email),
    phone                    = COALESCE(EXCLUDED.phone, candidates.phone),
    email_verification_status = COALESCE(EXCLUDED.email_verification_status, candidates.email_verification_status),
    revealed_at              = NOW(),
    reveal_count             = candidates.reveal_count + 1
  RETURNING id INTO v_candidate_id;

  -- Deduct 1 credit
  UPDATE profiles
  SET
    credits_balance  = credits_balance - 1,
    credits_used_mtd = credits_used_mtd + 1,
    updated_at       = NOW()
  WHERE id = p_user_id;

  -- Log credit transaction
  INSERT INTO credit_logs (
    user_id, org_id, amount, direction,
    action_type, ref_id, balance_after
  )
  VALUES (
    p_user_id, p_org_id, 1, 'debit',
    'reveal', v_candidate_id, v_current_bal - 1
  )
  RETURNING id INTO v_credit_log_id;

  -- Return result
  RETURN json_build_object(
    'candidate_id',   v_candidate_id,
    'credit_log_id',  v_credit_log_id,
    'balance_after',  v_current_bal - 1
  );
END;
$$;
```

---

## FILE 3 — lib/prospeo/client.ts  (Reusable Prospeo wrapper)

```typescript
const PROSPEO_BASE = "https://api.prospeo.io";

export interface ProspeoEmailResult {
  email: string | null;
  phone: string | null;
  emailStatus: "VERIFIED" | "ACCEPT_ALL" | "UNKNOWN" | null;
  error: null | "NOT_FOUND" | "DAILY_LIMIT" | "API_ERROR" | "NETWORK_ERROR";
}

export async function lookupLinkedInContact(linkedinUrl: string): Promise<ProspeoEmailResult> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) throw new Error("PROSPEO_API_KEY not set");

  try {
    const res = await fetch(`${PROSPEO_BASE}/email-finder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": apiKey,
      },
      body: JSON.stringify({ url: linkedinUrl }),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (res.status === 401) throw new Error("INVALID_API_KEY");
    if (!res.ok) return { email: null, phone: null, emailStatus: null, error: "API_ERROR" };

    const data = await res.json();

    if (data.error === true) {
      const msg: string = data.message ?? "";
      if (msg.includes("DAILY_LIMIT")) return { email: null, phone: null, emailStatus: null, error: "DAILY_LIMIT" };
      return { email: null, phone: null, emailStatus: null, error: "NOT_FOUND" };
    }

    const email = data.email?.value ?? null;
    const phone = data.mobile_number?.value ?? null;
    const emailStatus = data.email?.status ?? null;

    return { email, phone, emailStatus, error: null };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { email: null, phone: null, emailStatus: null, error: "NETWORK_ERROR" };
    }
    throw err;
  }
}
```

---

## FILE 4 — app/api/shortlist/route.ts  (POST — Add to shortlist)

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ShortlistSchema = z.object({
  candidate_id: z.string().uuid(),
  project_id:   z.string().uuid(),
  notes:        z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ShortlistSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  // Verify project belongs to user
  const { data: project } = await supabase
    .from("projects")
    .select("id, shortlist_count")
    .eq("id", parsed.data.project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Upsert shortlist entry (prevent duplicates)
  const { data: shortlist, error } = await supabase
    .from("shortlists")
    .upsert({
      user_id:      user.id,
      project_id:   parsed.data.project_id,
      candidate_id: parsed.data.candidate_id,
      notes:        parsed.data.notes,
      status:       "new",
    }, { onConflict: "project_id,candidate_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment project shortlist_count
  await supabase.from("projects")
    .update({ shortlist_count: project.shortlist_count + 1 })
    .eq("id", project.id);

  return NextResponse.json({ shortlist }, { status: 201 });
}
```

---

## ENV VARIABLES REQUIRED
Add to .env.local:
```
PROSPEO_API_KEY=your_prospeo_api_key_here
```
Add to Vercel project settings under Environment Variables.
NEVER commit the API key to Git.

---

## COMPLETION CHECKLIST
- [ ] POST /api/reveal — full flow: auth → cache check → credit check → Prospeo → atomic DB write
- [ ] reveal_contact RPC in Supabase SQL — run in Supabase SQL Editor
- [ ] lib/prospeo/client.ts — reusable wrapper with timeout + error types
- [ ] POST /api/shortlist — upsert, project ownership check, increment shortlist_count
- [ ] Cached reveals return FREE (no credit deduction)
- [ ] NO_CONTACT_FOUND returns 404, no credit deducted
- [ ] DAILY_LIMIT returns 429 with human message
- [ ] Race condition prevented by FOR UPDATE lock in RPC
- [ ] PROSPEO_API_KEY in .env.local, added to Vercel

## BUILD LOG ENTRY
## M03-06 Reveal API — [date]
### Files: api/reveal/route.ts, sql/reveal_contact_rpc.sql, lib/prospeo/client.ts, api/shortlist/route.ts
### Critical: Atomic RPC prevents double-charge. Cached reveals are free.
### Status: ✅ Complete
