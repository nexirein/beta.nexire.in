<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 01: IN-APP PRICING PAGE
# Trae: Read CLAUDE.md first.
# The pricing page lives inside the app at /settings/billing/plans.
# It shows the 4 Nexire plans (Free, Solo, Growth, Custom), the current plan badge,
# feature comparison table, and CTA to upgrade via Razorpay.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE: NEXIRE PRICING v5.0 (March 2026)
1. Define PLANS constant (Single Source of Truth) matching v5.0 spec
2. GET /api/billing/plans — returns current plan + usage
3. PricingPage at /settings/billing/plans with monthly/yearly toggle
4. PlanCard — shows price, credits, and "Save 2 months" annual badge
5. FeatureTable — comparison against Naukri, Cutshort, and LinkedIn

---

## PRICING STRATEGY (RESEARCH-BACKED)
- **Free (₹0)**: 10 searches, 15 credits. Evaluation tier.
- **Solo (₹3,999)**: 1,500 searches, 200 credits. For freelance/solo recruiters.
- **Growth (₹7,999)**: Unlimited searches, 600 credits. For agencies/teams.
- **Custom (₹24,999+)**: Shared pool, ATS integrations, white-label.

**The Credit Model**:
- Email reveal = 1 credit
- Phone + Email = 8 credits (Email is free with phone)

---

## FILE 1 — lib/billing/plans.ts  (single source of truth)

```typescript
export type PlanId = "free" | "solo" | "growth" | "custom";

export interface PlanConfig {
  id:                PlanId;
  name:              string;
  tagline:           string;
  color:             string;
  popular?:          boolean;
  
  // Pricing (INR)
  price_monthly:     number;
  price_annual:      number;   // Total annual price (10 months * monthly)

  // Limits (-1 = unlimited)
  credits_monthly:   number;   // Contact credits per month
  search_results:    number;   // Candidate searches per month
  max_roles:         number;   // Active roles
  max_sequences:     number;   // Active sequences
  client_view_shares:number;   // Client share links per month
  mailboxes:         number;   // Connected mailboxes
  
  // Features
  talent_network:    "none" | "basic" | "full";
  ai_search:         boolean;
  api_access:        boolean;
  white_label:       boolean;
  priority_support:  boolean;
  custom_integrations: boolean;
  credit_rollover:   boolean;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free", name: "Free", tagline: "See the AI rank your first 10 candidates", color: "#A0A0A0",
    price_monthly: 0, price_annual: 0,
    credits_monthly: 15, search_results: 10, max_roles: 1, max_sequences: 1, client_view_shares: 0, mailboxes: 0,
    talent_network: "none", ai_search: true, api_access: false, white_label: false, priority_support: false, custom_integrations: false, credit_rollover: true,
  },
  solo: {
    id: "solo", name: "Solo", tagline: "For the freelance recruiter handling 1-4 roles", color: "#38BDF8",
    price_monthly: 3999, price_annual: 39990,
    credits_monthly: 200, search_results: 1500, max_roles: 5, max_sequences: 5, client_view_shares: 5, mailboxes: 1,
    talent_network: "basic", ai_search: true, api_access: false, white_label: false, priority_support: false, custom_integrations: false, credit_rollover: true,
  },
  growth: {
    id: "growth", name: "Growth", tagline: "For agencies closing 10-20 roles/month", color: "#A855F7", popular: true,
    price_monthly: 7999, price_annual: 79990,
    credits_monthly: 600, search_results: -1, max_roles: -1, max_sequences: -1, client_view_shares: -1, mailboxes: 2,
    talent_network: "full", ai_search: true, api_access: true, white_label: false, priority_support: true, custom_integrations: false, credit_rollover: true,
  },
  custom: {
    id: "custom", name: "Custom", tagline: "For teams of 3+ hiring at scale", color: "#F59E0B",
    price_monthly: 24999, price_annual: 249990,
    credits_monthly: -1, search_results: -1, max_roles: -1, max_sequences: -1, client_view_shares: -1, mailboxes: 4,
    talent_network: "full", ai_search: true, api_access: true, white_label: true, priority_support: true, custom_integrations: true, credit_rollover: true,
  },
};

export const PLAN_FEATURES = [
  { key: "search_results",     label: "Candidate searches / mo",    free: "10",  solo: "1,500",   growth: "Unlimited*", custom: "Unlimited", highlight: true },
  { key: "credits_monthly",    label: "Contact credits / mo",       free: "15",  solo: "200",     growth: "600",       custom: "Custom",    highlight: true },
  { key: "max_phones",         label: "Max phone reveals (8cr)",    free: "1",   solo: "25",      growth: "75",        custom: "Unlimited" },
  { key: "max_roles",          label: "Active roles",               free: "1",   solo: "5",       growth: "Unlimited", custom: "Unlimited" },
  { key: "max_sequences",      label: "Active sequences",           free: "1",   solo: "5",       growth: "Unlimited", custom: "Unlimited" },
  { key: "client_view_shares", label: "Client share links",         free: "❌",   solo: "5/mo",    growth: "Unlimited", custom: "White-label" },
  { key: "mailboxes",          label: "Connected mailboxes",        free: "❌",   solo: "1",       growth: "2",         custom: "4+" },
  { key: "talent_network",     label: "Talent network signals",     free: "❌",   solo: "Basic",   growth: "Full",      custom: "Full" },
  { key: "api_access",         label: "API access",                 free: "❌",   solo: "❌",       growth: "✅",        custom: "✅" },
  { key: "white_label",        label: "White-label client pages",   free: "❌",   solo: "❌",       growth: "❌",        custom: "✅" },
  { key: "custom_integrations",label: "ATS Integrations",           free: "❌",   solo: "❌",       growth: "❌",        custom: "✅" },
];

export function formatLimit(val: number): string {
  if (val === -1) return "Unlimited";
  return val.toLocaleString("en-IN");
}

export function creditCostForReveal(type: "email" | "phone_email"): number {
  return type === "email" ? 1 : 8;
}

export const PLAN_ANNUAL_COPY = "Pay 10 months. Get 12. 2 months FREE.";
```

---

## FILE 2 — app/api/billing/plans/route.ts

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: org } = await supabase
    .from("orgs")
    .select("id, plan_id, plan_expires_at, billing_cycle, credits_balance, credits_used")
    .eq("id", (await supabase.from("profiles").select("org_id").eq("id", user.id).single()).data?.org_id)
    .single();

  // Usage this month
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [{ count: searches }, { count: roles }] = await Promise.all([
    supabase.from("search_logs").select("id", { count: "exact", head: true })
      .eq("org_id", org?.id).gte("created_at", monthStart.toISOString()),
    supabase.from("roles").select("id", { count: "exact", head: true })
      .eq("org_id", org?.id).eq("status", "active"),
  ]);

  return NextResponse.json({
    current_plan:    org?.plan_id ?? "free",
    billing_cycle:   org?.billing_cycle ?? "monthly",
    plan_expires_at: org?.plan_expires_at,
    plans:           PLANS,
    usage: {
      searches_this_month: searches ?? 0,
      credits_balance:     org?.credits_balance ?? 0,
      credits_used:        org?.credits_used ?? 0,
      active_roles:        roles ?? 0,
    },
  });
}
```

---

## FILE 3 — app/(app)/settings/billing/plans/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { Check, X, Star, ChevronDown, Info } from "lucide-react";
import { PLANS, PLAN_FEATURES, PLAN_ANNUAL_COPY, type PlanId } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const PLAN_ORDER: PlanId[] = ["free", "solo", "growth"];

export default function PlansPage() {
  const router            = useRouter();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [currentPlan, setCurrentPlan] = useState<PlanId>("free");
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    fetch("/api/billing/plans").then(r => r.json()).then(d => {
      setCurrentPlan(d.current_plan);
      setBilling(d.billing_cycle ?? "monthly");
      setLoading(false);
    });
  }, []);

  const handleUpgrade = (planId: PlanId) => {
    if (planId === "custom") {
      window.open("mailto:sales@nexire.in?subject=Custom Plan Inquiry", "_blank");
      return;
    }
    router.push(`/settings/billing/checkout?plan=${planId}&cycle=${billing}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-10 max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-[#FAFAFA] mb-2">
          Simple, transparent pricing
        </h1>
        <p className="text-[#555555] text-sm mb-6">Every number has a research-backed reason. Credits never expire.</p>

        {/* Billing toggle */}
        <div className="inline-flex items-center bg-[#111111] border border-[#222222] rounded-xl p-1 gap-1">
          {(["monthly", "yearly"] as const).map(cycle => (
            <button key={cycle} onClick={() => setBilling(cycle)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                billing === cycle ? "bg-[#38BDF8] text-white" : "text-[#555555] hover:text-[#A0A0A0]"
              )}>
              {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
              {cycle === "yearly" && <span className="ml-1.5 text-[10px] bg-green-400/20 text-green-400 px-1.5 py-0.5 rounded-md">Save 2 months</span>}
            </button>
          ))}
        </div>
        {billing === "yearly" && (
           <p className="text-[10px] text-green-400 mt-2 font-medium">{PLAN_ANNUAL_COPY}</p>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {PLAN_ORDER.map(planId => {
          const plan    = PLANS[planId];
          const price   = billing === "yearly" ? Math.round(plan.price_annual / 12) : plan.price_monthly;
          const isCurrent = planId === currentPlan;
          const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(currentPlan);

          return (
            <div key={planId} className={cn(
              "relative bg-[#111111] border rounded-2xl p-6 flex flex-col transition-all",
              plan.popular ? "border-[#38BDF8]/50 shadow-glow-blue" : "border-[#1A1A1A]",
              isCurrent && "ring-1 ring-[#38BDF8]/30"
            )}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-glow-blue">
                    <Star className="w-2.5 h-2.5" /> Most popular
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute top-4 right-4">
                  <span className="text-[9px] bg-green-400/10 border border-green-400/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
                    Current plan
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: plan.color }} />
                  <h3 className="text-sm font-bold text-[#FAFAFA]">{plan.name}</h3>
                </div>
                <p className="text-xs text-[#555555] mb-4 h-8">{plan.tagline}</p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-[#FAFAFA]">
                    ₹{price.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-[#555555] mb-1">/mo{billing === "yearly" ? ", billed annually" : ""}</span>
                </div>
              </div>

              {/* Key limits */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  { label: "Contact Credits", val: plan.credits_monthly === -1 ? "Custom" : plan.credits_monthly.toLocaleString() },
                  { label: "Search results",  val: plan.search_results === -1 ? "Unlimited" : plan.search_results.toLocaleString() },
                  { label: "Active roles",    val: plan.max_roles === -1 ? "Unlimited" : String(plan.max_roles) },
                  { label: "AI ranking",      val: plan.ai_search },
                  { label: "Talent Network",  val: plan.talent_network !== "none" },
                ].map(item => (
                  <li key={item.label} className="flex items-center gap-2.5 text-xs">
                    {typeof item.val === "boolean" ? (
                      item.val
                        ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        : <X     className="w-3.5 h-3.5 text-[#333333] flex-shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    )}
                    <span className="text-[#555555]">{item.label}</span>
                    {typeof item.val !== "boolean" && (
                      <span className="ml-auto font-medium text-[#A0A0A0]">{item.val}</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="bg-[#0D0D0D] rounded-lg p-2.5 mb-6 border border-[#1A1A1A]">
                <p className="text-[10px] text-[#555555] flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  1 Email = 1 credit · 1 Phone = 8 credits
                </p>
              </div>

              <button
                onClick={() => handleUpgrade(planId)}
                disabled={isCurrent || loading || planId === "free"}
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-semibold transition-all",
                  isCurrent
                    ? "bg-[#1A1A1A] text-[#333333] cursor-default"
                    : isUpgrade
                    ? "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white hover:from-[#0EA5E9] hover:to-[#0284C7] shadow-glow-blue"
                    : "bg-[#1A1A1A] border border-[#222222] text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333]"
                )}
              >
                {isCurrent ? "Current plan" : isUpgrade ? "Upgrade" : "Downgrade"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Custom */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl px-6 py-5 flex items-center justify-between mb-8">
        <div>
          <p className="text-sm font-bold text-[#FAFAFA]">Custom / Enterprise</p>
          <p className="text-xs text-[#555555] mt-0.5">Starting ₹24,999/mo · Shared pool · ATS integrations · White-label</p>
        </div>
        <button
          onClick={() => window.open("mailto:sales@nexire.in", "_blank")}
          className="px-5 py-2.5 rounded-xl border border-[#333333] text-sm text-[#A0A0A0] hover:border-[#555555] hover:text-[#FAFAFA] transition-all"
        >
          Contact sales
        </button>
      </div>

      {/* Full comparison table toggle */}
      <button onClick={() => setShowTable(!showTable)}
        className="flex items-center gap-2 text-xs text-[#555555] hover:text-[#A0A0A0] mx-auto transition-colors mb-4">
        Compare against Naukri, Cutshort & LinkedIn
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showTable && "rotate-180")} />
      </button>

      {showTable && (
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                <th className="px-5 py-4 text-left text-[10px] text-[#555555] uppercase tracking-wider w-48">Feature</th>
                {PLAN_ORDER.map(p => (
                  <th key={p} className="px-4 py-4 text-center text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: PLANS[p].color }}>{PLANS[p].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map(f => (
                <tr key={f.key} className={cn("border-b border-[#0D0D0D]", f.highlight && "bg-[#0D0D0D]")}>
                  <td className="px-5 py-3.5 text-[#555555]">{f.label}</td>
                  {PLAN_ORDER.map(p => {
                    const val = f[p as keyof typeof f];
                    return (
                      <td key={p} className="px-4 py-3.5 text-center">
                        {val === "✅" ? <Check className="w-4 h-4 text-green-400 mx-auto" /> :
                         val === "❌" ? <X className="w-4 h-4 text-[#222222] mx-auto" /> :
                         <span className="text-[#A0A0A0] font-medium">{val}</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] lib/billing/plans.ts: PLANS constant (v5.0 spec), PlanConfig (flat structure)
- [ ] GET /api/billing/plans: returns `orgs.credits_balance` (using `orgs` table as source)
- [ ] PlansPage: "Save 2 months" annual badge, correct monthly price calculation (`price_annual / 12`)
- [ ] PlanCard: Shows contact credits and Info tooltip for credit ratio
- [ ] Upgrade button → /settings/billing/checkout?plan=X&cycle=Y
- [ ] Custom → mailto:sales@nexire.in
- [ ] Full comparison table includes competitor benchmarks

## BUILD LOG ENTRY
## M10-01 Pricing Page v5.0 — [date]
### Files: plans.ts (v5.0 PlanConfig), /api/billing/plans GET, PlansPage (v5 UI)
### Status: ✅ Complete
