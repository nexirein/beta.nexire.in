<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 06: PLAN UPGRADE LOGIC
# Trae: Read CLAUDE.md first.
# Plan upgrade/downgrade/cancellation flow for NEXIRE v5.0.
# Handles: 3-day grace period after expiry, PlanExpiredBanner,
# feature gates via canAccess(), daily cron downgrade job to 'free'.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. lib/billing/plan-access.ts — getOrgPlan(), canAccess(), checkUsageLimit()
2. PATCH /api/billing/cancel — cancel subscription (expire at period end)
3. app/(app)/settings/billing/BillingOverviewCard.tsx — plan card with credit usage bars
4. components/PlanExpiredBanner.tsx — global sticky warning banner
5. app/api/cron/plan-expiry/route.ts — daily downgrade job to 'free'

---

## FILE 1 — lib/billing/plan-access.ts

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS, type PlanId, type PlanConfig } from "@/lib/billing/plans";

const GRACE_DAYS = 3;

export interface OrgPlanInfo {
  plan_id:         PlanId;
  plan_expires_at: string | null;
  billing_cycle:   "monthly" | "yearly";
  is_expired:      boolean;
  is_in_grace:     boolean;  // expired but within 3-day grace window
  days_remaining:  number;   // days until expiry (0 if expired)
}

export async function getOrgPlan(orgId: string): Promise<OrgPlanInfo> {
  const service = createServiceClient();
  const { data } = await service
    .from("orgs")
    .select("plan_id, plan_expires_at, billing_cycle")
    .eq("id", orgId)
    .single();

  const planId    = (data?.plan_id ?? "free") as PlanId;
  const expiresAt = data?.plan_expires_at ? new Date(data.plan_expires_at) : null;
  const now       = new Date();

  const is_expired  = expiresAt ? now > expiresAt : false;
  const graceEnd    = expiresAt
    ? new Date(expiresAt.getTime() + GRACE_DAYS * 86_400_000)
    : null;
  const is_in_grace = is_expired && graceEnd ? now <= graceEnd : false;
  const days_remaining = expiresAt && !is_expired
    ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
    : 0;

  return {
    // Treat as free only after grace period lapses
    plan_id:         is_expired && !is_in_grace ? "free" : planId,
    plan_expires_at: data?.plan_expires_at ?? null,
    billing_cycle:   (data?.billing_cycle ?? "monthly") as "monthly" | "yearly",
    is_expired,
    is_in_grace,
    days_remaining,
  };
}

/**
 * Check if a plan has access to a feature (boolean or numeric limit > 0).
 */
export function canAccess(
  planId: PlanId,
  feature: keyof PlanConfig
): boolean {
  const plan = PLANS[planId];
  if (!plan) return false;
  
  const val = plan[feature];
  if (typeof val === "boolean") return val;
  if (typeof val === "number")  return val !== 0; // 0 means no access/limit
  return false;
}

export function getPlanConfig(planId: PlanId) {
  return PLANS[planId] ?? PLANS.free;
}

/**
 * Bulk usage check for credits and searches.
 * Checks against orgs table (Single Source of Truth).
 */
export async function checkUsageLimit(params: {
  orgId:    string;
  planId:   PlanId;
  resource: "search_results" | "credits_monthly";
}): Promise<{ allowed: boolean; used: number; limit: number }> {
  const plan  = getPlanConfig(params.planId);
  const limit = plan[params.resource] as number;
  
  // -1 means unlimited
  if (limit === -1) return { allowed: true, used: 0, limit: -1 };

  const service = createServiceClient();
  
  if (params.resource === "credits_monthly") {
    // Check current balance from orgs table
    const { data } = await service
      .from("orgs")
      .select("credits_balance")
      .eq("id", params.orgId)
      .single();
      
    const balance = data?.credits_balance ?? 0;
    // For credits, we check if they HAVE balance (balance > 0)
    // Note: This function checks "is allowed to start action". 
    // Specific cost check (e.g. need 8 credits) should be done by caller.
    return { allowed: balance > 0, used: 0, limit };
  }

  // For searches, check logs
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count } = await service
    .from("search_logs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", params.orgId)
    .gte("created_at", monthStart.toISOString());

  const used = count ?? 0;
  return { allowed: used < limit, used, limit };
}
```

---

## FILE 2 — app/api/billing/cancel/route.ts

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpay } from "@/lib/billing/razorpay";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: org } = await supabase
    .from("orgs")
    .select("id, plan_id, plan_expires_at, razorpay_sub_id, billing_cancelled_at")
    .eq("id", profile?.org_id)
    .single();

  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  if (org.plan_id === "free")
    return NextResponse.json({ error: "Already on Free plan" }, { status: 400 });
  if (org.billing_cancelled_at)
    return NextResponse.json({ error: "Already cancelled — plan active until expiry" }, { status: 400 });

  // Cancel Razorpay subscription if it exists
  if (org.razorpay_sub_id) {
    try {
      const rzp = getRazorpay();
      await rzp.subscriptions.cancel(org.razorpay_sub_id, false);
    } catch (err) {
      console.error("[BILLING/CANCEL] Razorpay sub cancel failed:", err);
    }
  }

  const service = createServiceClient();

  await service.from("orgs")
    .update({
      billing_cancelled_at: new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    })
    .eq("id", org.id);

  await service.from("billing_events").insert({
    org_id:     org.id,
    event_type: "subscription_cancelled",
    plan_id:    org.plan_id,
    metadata: {
      expires_at:   org.plan_expires_at,
      cancelled_by: user.id,
    },
  });

  const expiryFormatted = org.plan_expires_at
    ? new Date(org.plan_expires_at).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "the end of your billing period";

  return NextResponse.json({
    success: true,
    message: `Plan cancelled. Access continues until ${expiryFormatted}, then reverts to Free.`,
    expires_at: org.plan_expires_at,
  });
}
```

---

## FILE 3 — app/(app)/settings/billing/BillingOverviewCard.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, X, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PLAN_COLOR_CLASS: Record<string, string> = {
  free:       "bg-[#555555]",
  solo:       "bg-[#38BDF8]",
  growth:     "bg-[#A855F7]",
  custom:     "bg-yellow-400",
};

export function BillingOverviewCard() {
  const router        = useRouter();
  const [data, setData]               = useState<any>(null);
  const [cancelling, setCancelling]   = useState(false);
  const [confirmCancel, setConfirm]   = useState(false);

  useEffect(() => {
    fetch("/api/billing/plans").then(r => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl h-48 animate-pulse" />
    );
  }

  const planId    = data.current_plan as PlanId;
  const plan      = PLANS[planId];
  const expiresAt = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
  const isExpired = expiresAt ? new Date() > expiresAt : false;
  const daysLeft  = expiresAt && !isExpired
    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
    : 0;
  const isCancelled = !!data.billing_cancelled_at;

  const handleCancel = async () => {
    if (!confirmCancel) { setConfirm(true); return; }
    setCancelling(true);
    const res  = await fetch("/api/billing/cancel", { method: "POST" });
    const json = await res.json();
    setCancelling(false);
    setConfirm(false);
    if (res.ok) { toast.success(json.message); setData((d: any) => ({ ...d, billing_cancelled_at: new Date().toISOString() })); }
    else         toast.error(json.error ?? "Cancellation failed");
  };

  return (
    <div className={cn(
      "bg-[#111111] border rounded-2xl p-6 transition-all",
      isExpired ? "border-red-400/30" : isCancelled ? "border-yellow-400/20" : "border-[#1A1A1A]"
    )}>
      <div className="flex items-start justify-between gap-4 mb-6">
        {/* Left: plan info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={cn("w-2.5 h-2.5 rounded-full", PLAN_COLOR_CLASS[planId] ?? "bg-[#555555]")} />
            <p className="text-lg font-bold text-[#FAFAFA]">{plan?.name ?? planId} Plan</p>

            {isExpired && (
              <span className="text-[10px] bg-red-400/10 border border-red-400/20 text-red-400 px-2 py-0.5 rounded-full font-medium">Expired</span>
            )}
            {isCancelled && !isExpired && (
              <span className="text-[10px] bg-orange-400/10 border border-orange-400/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
            )}
          </div>

          <p className="text-xs text-[#555555]">
            {data.billing_cycle === "yearly" ? "Billed annually" : "Billed monthly"}
            {expiresAt && !isExpired && ` · Renews ${expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
            {isCancelled && !isExpired && ` · Access until ${expiresAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
          </p>
        </div>

        {/* Right: CTAs */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {planId !== "free" && !isCancelled && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className={cn(
                "px-4 py-2 rounded-xl text-xs border transition-all",
                confirmCancel
                  ? "border-red-400/30 text-red-400 bg-red-400/10 hover:bg-red-400/20"
                  : "border-[#222222] text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333]"
              )}
            >
              {cancelling ? "Cancelling…" : confirmCancel ? "Confirm cancel" : "Cancel plan"}
            </button>
          )}
          <button
            onClick={() => router.push("/settings/billing/plans")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-xs font-semibold hover:from-[#0EA5E9] hover:to-[#0284C7] shadow-glow-blue transition-all"
          >
            {planId === "free" || isExpired ? "Upgrade" : "Change plan"}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Usage bars */}
      {data.usage && plan && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-[#1A1A1A]">
          {[
            { label: "Contact Credits", used: data.usage.credits_used, max: plan.credits_monthly, info: "1 Email = 1cr, 1 Phone = 8cr" },
            { label: "Searches this month", used: data.usage.searches_this_month, max: plan.search_results },
            { label: "Active roles",     used: data.usage.active_roles,      max: plan.max_roles },
          ].map(s => {
            const infinite = s.max === -1;
            const pct      = infinite ? 0 : Math.min(100, (s.used / (s.max || 1)) * 100);
            const warn     = !infinite && pct >= 85;
            return (
              <div key={s.label}>
                <div className="flex justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#555555] uppercase tracking-wider font-semibold">{s.label}</span>
                    {s.info && (
                      <div className="group relative">
                        <Info className="w-3 h-3 text-[#333333] cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-32 bg-[#222222] text-[9px] text-[#A0A0A0] p-2 rounded shadow-xl border border-[#333333]">
                          {s.info}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-[#FAFAFA] font-medium">
                    {s.used} / {infinite ? "∞" : s.max.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-[#0D0D0D] rounded-full overflow-hidden border border-[#1A1A1A]">
                  {!infinite && (
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", warn ? "bg-orange-400" : "bg-[#38BDF8]")}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
                {warn && (
                  <p className="text-[9px] text-orange-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> {Math.round(pct)}% used
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

## FILE 4 — components/PlanExpiredBanner.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { AlertTriangle, ArrowUpRight, X } from "lucide-react";
import Link from "next/link";

type BannerState = "hidden" | "expiring_soon" | "in_grace" | "expired";

export function PlanExpiredBanner() {
  const [state, setState]     = useState<BannerState>("hidden");
  const [daysLeft, setDaysLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then(r => r.json())
      .then(data => {
        if (!data.plan_expires_at) return;
        const expiry    = new Date(data.plan_expires_at);
        const graceEnd  = new Date(expiry.getTime() + 3 * 86_400_000);
        const now       = new Date();

        if (now > graceEnd)     { setState("expired");      return; }
        if (now > expiry)       { setState("in_grace");     return; }

        const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
        setDaysLeft(days);
        if (days <= 5) setState("expiring_soon");
      });
  }, []);

  if (state === "hidden" || dismissed) return null;

  const MESSAGES: Record<BannerState, string> = {
    hidden:        "",
    expiring_soon: `Your plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Renew to keep your credits and roles.`,
    in_grace:      "Your plan has expired. 3-day grace period active — renew now to keep your data.",
    expired:       "Your plan has lapsed. Reverted to Free. Upgrade to Solo or Growth to restore access.",
  };

  const isUrgent = state === "expired" || state === "in_grace";

  return (
    <div className={`w-full flex items-center gap-3 px-4 py-2.5 border-b ${
      isUrgent ? "bg-red-400/10 border-red-400/20" : "bg-orange-400/10 border-orange-400/20"
    }`}>
      <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isUrgent ? "text-red-400" : "text-orange-400"}`} />
      <p className={`text-xs flex-1 ${isUrgent ? "text-red-400" : "text-orange-400"}`}>
        {MESSAGES[state]}
      </p>
      <Link href="/settings/billing/plans" className={`flex items-center gap-1 text-xs font-bold flex-shrink-0 ${
          isUrgent ? "text-red-400" : "text-orange-400"
        }`}>
        {state === "expired" ? "Upgrade" : "Renew"} <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
```

---

## FILE 5 — app/api/cron/plan-expiry/route.ts  (Daily downgrade to 'free')

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service  = createServiceClient();
  const GRACE_MS = 3 * 86_400_000;
  const graceCutoff = new Date(Date.now() - GRACE_MS).toISOString();

  const { data: expiredOrgs } = await service
    .from("orgs")
    .select("id, plan_id")
    .lt("plan_expires_at", graceCutoff)
    .neq("plan_id", "free");

  if (!expiredOrgs?.length) return NextResponse.json({ downgraded: 0 });

  const orgIds = expiredOrgs.map(o => o.id);

  await service
    .from("orgs")
    .update({ plan_id: "free", plan_expires_at: null, updated_at: new Date().toISOString() })
    .in("id", orgIds);

  await service.from("billing_events").insert(
    expiredOrgs.map(o => ({
      org_id: o.id,
      event_type: "plan_expired_downgrade",
      plan_id: o.plan_id,
      metadata: { downgraded_to: "free", reason: "grace_period_lapsed" },
    }))
  );

  return NextResponse.json({ downgraded: orgIds.length });
}
```

---

## COMPLETION CHECKLIST
- [ ] lib/billing/plan-access.ts: `checkUsageLimit` checks `orgs.credits_balance` (Source of Truth)
- [ ] lib/billing/plan-access.ts: `canAccess` updated to handle flat `PlanConfig` structure
- [ ] BillingOverviewCard: updated to use flat PlanConfig props (`credits_monthly`, etc.)
- [ ] PlanExpiredBanner: messaging updated for v5.0 tiers
- [ ] Cron job: downgrades to `free` after grace period

## BUILD LOG ENTRY
## M10-06 Plan Upgrade Logic v5.0 — [date]
### Files: plan-access.ts (Credits/Limits), BillingOverviewCard, PlanExpiredBanner
### Status: ✅ Complete
