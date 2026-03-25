<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/settings.md        ← this module's API contract
-->

# M11 — TASK 04: USAGE & CREDITS
# Trae: Read CLAUDE.md first.
# Read lib/config/plans.ts for plan limits.
# Read M10-SETTINGS/00-pricing-v5-credit-model.md for credit model.
# The Usage page shows recruiters their credit balance, monthly burn rate,
# reveal breakdown (emails vs phones), and full transaction history.
# Route: /settings/usage
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. UsageStatsPage at /settings/usage
2. GET /api/settings/usage — credits balance + monthly summary + transactions
3. Credit balance card with visual gauge
4. Monthly reveal breakdown (emails vs phones vs total)
5. Credit transaction history table (paginated, 25/page)
6. Per-member usage breakdown (admin/owner view only, Growth+)
7. CreditsBadge sidebar widget — always-visible mini balance in sidebar footer

---

## FILE 1 — app/(app)/settings/usage/page.tsx

```tsx
import { createClient } from "@/lib/supabase/server";
import { UsageStatsClient } from "./UsageStatsClient";
export const metadata = { title: "Usage & Credits | Nexire" };

export default async function UsagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase
    .from("profiles")
    .select("org_id, member_role")
    .eq("id", user?.id)
    .single();

  return (
    <UsageStatsClient
      currentUserId={user?.id ?? ""}
      isAdmin={["owner", "admin"].includes(profile?.member_role ?? "")}
    />
  );
}
```

---

## FILE 2 — app/api/settings/usage/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/config/plans";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 25;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, member_role")
    .eq("id", user.id)
    .single();

  const orgId = profile?.org_id;

  const { data: org } = await supabase
    .from("orgs")
    .select("plan, billing_cycle, credits_balance, credits_used, credits_monthly, cycle_resets_at")
    .eq("id", orgId)
    .single();

  const planConfig = PLANS[(org?.plan as keyof typeof PLANS)] ?? PLANS.free;

  // Cycle start = last reset date (or 1st of current month fallback)
  const cycleStart = org?.cycle_resets_at
    ? new Date(new Date(org.cycle_resets_at).setMonth(new Date(org.cycle_resets_at).getMonth() - 1))
    : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();

  // This-cycle summary — debits only
  const { data: cycleDebits } = await supabase
    .from("credit_transactions")
    .select("type, amount")
    .eq("org_id", orgId)
    .lt("amount", 0)
    .gte("created_at", cycleStart.toISOString());

  const emailReveals = (cycleDebits ?? []).filter(t => t.type === "reveal_email").length;
  const phoneReveals = (cycleDebits ?? []).filter(t => t.type === "reveal_phone").length;
  const creditsBurnt = (cycleDebits ?? []).reduce((s, t) => s + Math.abs(t.amount), 0);

  // Paginated transaction history
  const { data: transactions, count: txnCount } = await supabase
    .from("credit_transactions")
    .select("id, type, amount, balance_after, notes, created_at, user_id, candidate_id", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Per-member breakdown — only for admins/owners
  let memberBreakdown: any[] = [];
  if (["owner", "admin"].includes(profile?.member_role ?? "")) {
    const { data: memberDebits } = await supabase
      .from("credit_transactions")
      .select("user_id, type, amount")
      .eq("org_id", orgId)
      .lt("amount", 0)
      .gte("created_at", cycleStart.toISOString());

    const byUser: Record<string, { emails: number; phones: number; credits: number }> = {};
    (memberDebits ?? []).forEach(t => {
      if (!t.user_id) return;
      if (!byUser[t.user_id]) byUser[t.user_id] = { emails: 0, phones: 0, credits: 0 };
      byUser[t.user_id].credits += Math.abs(t.amount);
      if (t.type === "reveal_email") byUser[t.user_id].emails++;
      if (t.type === "reveal_phone") byUser[t.user_id].phones++;
    });

    const userIds = Object.keys(byUser);
    if (userIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      memberBreakdown = (memberProfiles ?? [])
        .map(m => ({ ...m, ...(byUser[m.id] ?? { emails: 0, phones: 0, credits: 0 }) }))
        .sort((a, b) => b.credits - a.credits);
    }
  }

  return NextResponse.json({
    org: {
      plan:            org?.plan ?? "free",
      billing_cycle:   org?.billing_cycle ?? "monthly",
      credits_balance: org?.credits_balance ?? 0,
      credits_used:    org?.credits_used ?? 0,
      credits_monthly: org?.credits_monthly ?? planConfig.credits_monthly,
      cycle_resets_at: org?.cycle_resets_at ?? null,
    },
    this_cycle: {
      email_reveals: emailReveals,
      phone_reveals: phoneReveals,
      credits_burnt: creditsBurnt,
    },
    transactions:       transactions ?? [],
    total_transactions: txnCount ?? 0,
    page,
    limit,
    member_breakdown: memberBreakdown,
  });
}
```

---

## FILE 3 — app/(app)/settings/usage/UsageStatsClient.tsx

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Zap, Mail, Phone, ChevronLeft, ChevronRight,
  RefreshCw, Users, Info, ExternalLink, ArrowUpRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/config/plans";

const TXN_CONFIG: Record<string, { label: string; color: string }> = {
  monthly_grant:    { label: "Monthly grant",   color: "text-green-400"  },
  rollover:         { label: "Rollover",         color: "text-[#38BDF8]"  },
  reveal_email:     { label: "Email reveal",     color: "text-[#555555]"  },
  reveal_phone:     { label: "Phone + Email reveal", color: "text-[#555555]" },
  manual_topup:     { label: "Manual top-up",    color: "text-purple-400" },
  refund:           { label: "Refund",           color: "text-green-400"  },
};

interface Props {
  currentUserId: string;
  isAdmin:       boolean;
}

export function UsageStatsClient({ currentUserId, isAdmin }: Props) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const load = useCallback(async (p: number = 1) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/settings/usage?page=${p}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    load(newPage);
  };

  const org         = data?.org ?? {};
  const cycle       = data?.this_cycle ?? {};
  const planConfig  = PLANS[(org.plan as keyof typeof PLANS)] ?? PLANS.free;
  const balance     = org.credits_balance ?? 0;
  const monthly     = org.credits_monthly ?? planConfig.credits_monthly;
  const used        = org.credits_used ?? 0;
  const usedPct     = monthly > 0 ? Math.min(100, Math.round((used / monthly) * 100)) : 0;
  const totalPages  = Math.ceil((data?.total_transactions ?? 0) / 25);

  const resetsAt    = org.cycle_resets_at ? new Date(org.cycle_resets_at) : null;
  const isLow       = balance <= Math.floor(monthly * 0.15) && monthly > 0;

  const planLabel = org.plan
    ? org.plan.charAt(0).toUpperCase() + org.plan.slice(1)
    : "Free";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">Usage & Credits</h1>
          <p className="text-xs text-[#555555] mt-0.5">
            {planLabel} plan · {org.billing_cycle ?? "monthly"}
          </p>
        </div>
        <button
          onClick={() => load(page)}
          className="p-2 rounded-xl text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111] transition-all"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Balance card ── */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
              Credits remaining
            </p>
            {loading ? (
              <div className="h-10 w-28 bg-[#1A1A1A] rounded-xl mt-1.5 animate-pulse" />
            ) : (
              <div className="flex items-baseline gap-2 mt-1">
                <p className={cn(
                  "text-4xl font-bold",
                  isLow ? "text-yellow-400" : "text-[#FAFAFA]"
                )}>
                  {balance.toLocaleString()}
                </p>
                <p className="text-sm text-[#555555]">/ {monthly.toLocaleString()}</p>
              </div>
            )}
            {resetsAt && (
              <p className="text-[10px] text-[#333333] mt-1.5">
                Renews{" "}
                {resetsAt.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                {" · "}
                <span className="text-[#38BDF8]">Credits never expire — unused credits roll over</span>
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Used this cycle</p>
            {loading
              ? <div className="h-8 w-16 bg-[#1A1A1A] rounded-xl mt-1.5 animate-pulse ml-auto" />
              : <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{used.toLocaleString()}</p>
            }
            <p className="text-[10px] text-[#555555]">credits</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#555555]">{usedPct}% used</p>
            {isLow && (
              <a
                href="/settings/billing"
                className="text-[10px] text-yellow-400 hover:underline flex items-center gap-1"
              >
                Running low · Upgrade <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                usedPct > 90
                  ? "bg-red-400"
                  : usedPct > 70
                  ? "bg-yellow-400"
                  : "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9]"
              )}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── This-cycle stat cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label:   "Email reveals",
            value:   cycle.email_reveals ?? 0,
            icon:    Mail,
            color:   "text-[#38BDF8]",
            bg:      "bg-[#38BDF8]/10",
            sub:     `${(cycle.email_reveals ?? 0) * 1} credits`,
          },
          {
            label:   "Phone reveals",
            value:   cycle.phone_reveals ?? 0,
            icon:    Phone,
            color:   "text-green-400",
            bg:      "bg-green-400/10",
            sub:     `${(cycle.phone_reveals ?? 0) * 8} credits`,
          },
          {
            label:   "Credits spent",
            value:   cycle.credits_burnt ?? 0,
            icon:    Zap,
            color:   "text-purple-400",
            bg:      "bg-purple-400/10",
            sub:     "total this cycle",
          },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5">
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3", s.bg)}>
                <Icon className={cn("w-4 h-4", s.color)} />
              </div>
              {loading
                ? <div className="h-7 w-14 bg-[#1A1A1A] rounded animate-pulse" />
                : <p className="text-2xl font-bold text-[#FAFAFA]">{s.value.toLocaleString()}</p>
              }
              <p className="text-[11px] text-[#555555] mt-1">{s.label}</p>
              <p className="text-[10px] text-[#333333]">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Credit explainer banner ── */}
      <div className="flex items-start gap-3 bg-[#111111] border border-[#1A1A1A] rounded-2xl px-4 py-3.5">
        <Info className="w-4 h-4 text-[#555555] flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#555555] leading-relaxed">
          <span className="text-[#A0A0A0] font-medium">Email reveal = 1 credit</span>
          {" · "}
          <span className="text-[#A0A0A0] font-medium">Phone + Email reveal = 8 credits</span>
          {" (email is free when bundled with phone). "}
          Credits <span className="text-[#38BDF8]">never expire</span> — unused credits roll over to next month automatically.
        </p>
      </div>

      {/* ── Per-member breakdown (admin only, Growth+) ── */}
      {isAdmin && (data?.member_breakdown?.length ?? 0) > 0 && (
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#555555]" />
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Team usage</h2>
            <span className="text-[10px] text-[#555555] ml-auto">This billing cycle</span>
          </div>
          <div className="space-y-3.5">
            {(data?.member_breakdown ?? []).map((m: any) => {
              const maxCr   = Math.max(...(data?.member_breakdown ?? []).map((x: any) => x.credits), 1);
              const barPct  = Math.round((m.credits / maxCr) * 100);
              const initials = (m.full_name ?? "?")
                .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-[#555555] overflow-hidden">
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-[#A0A0A0] truncate">{m.full_name ?? "—"}</p>
                      <p className="text-[10px] text-[#555555] flex-shrink-0 ml-2 font-mono">
                        {m.credits} cr · {m.emails}✉ {m.phones}📞
                      </p>
                    </div>
                    <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#38BDF8]/60 rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transaction history ── */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Credit history</h2>
          <p className="text-[11px] text-[#555555]">
            {(data?.total_transactions ?? 0).toLocaleString()} transactions
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#0D0D0D]">
              {["Date", "Type", "Notes", "Amount", "Balance"].map(h => (
                <th
                  key={h}
                  className="px-5 py-3.5 text-left text-[10px] text-[#555555] uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-[#0D0D0D]">
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-[#1A1A1A] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (data?.transactions ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <Zap className="w-8 h-8 text-[#1A1A1A] mx-auto mb-2" />
                  <p className="text-xs text-[#333333]">No transactions yet</p>
                </td>
              </tr>
            ) : (
              (data?.transactions ?? []).map((txn: any) => {
                const cfg   = TXN_CONFIG[txn.type] ?? { label: txn.type, color: "text-[#555555]" };
                const debit = txn.amount < 0;
                return (
                  <tr
                    key={txn.id}
                    className="border-b border-[#0D0D0D] hover:bg-[#0A0A0A] transition-colors"
                  >
                    <td className="px-5 py-4 text-xs text-[#555555] whitespace-nowrap">
                      {new Date(txn.created_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn("text-[11px] font-medium", cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[11px] text-[#555555] max-w-[180px] truncate">
                      {txn.notes ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        debit ? "text-[#555555]" : "text-green-400"
                      )}>
                        {debit ? `−${Math.abs(txn.amount)}` : `+${txn.amount}`}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-[#A0A0A0]">
                      {(txn.balance_after ?? 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#1A1A1A]">
            <p className="text-xs text-[#555555]">{data?.total_transactions ?? 0} total</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-[#555555] px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## FILE 4 — components/layout/CreditsBadge.tsx  (Sidebar mini-widget)

```tsx
"use client";
import { useEffect, useState } from "react";
import { Zap, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CreditsState {
  balance: number;
  monthly: number;
  plan:    string;
}

export function CreditsBadge() {
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/usage?page=1")
      .then(r => r.json())
      .then(d => {
        setCredits({
          balance: d.org?.credits_balance ?? 0,
          monthly: d.org?.credits_monthly ?? 0,
          plan:    d.org?.plan ?? "free",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-2 h-9 bg-[#111111] rounded-xl animate-pulse" />
    );
  }
  if (!credits) return null;

  const usedPct = credits.monthly > 0
    ? Math.min(100, Math.round(((credits.monthly - credits.balance) / credits.monthly) * 100))
    : 0;
  const isLow   = credits.balance <= Math.floor(credits.monthly * 0.15) && credits.monthly > 0;

  return (
    <Link
      href="/settings/usage"
      className="flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-xl hover:bg-[#111111] transition-all group"
    >
      {/* Icon */}
      <div className={cn(
        "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
        isLow ? "bg-yellow-400/10" : "bg-[#38BDF8]/10"
      )}>
        <Zap className={cn("w-3.5 h-3.5", isLow ? "text-yellow-400" : "text-[#38BDF8]")} />
      </div>

      {/* Bar + numbers */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-[#555555]">Credits</p>
          <p className={cn(
            "text-[10px] font-bold tabular-nums",
            isLow ? "text-yellow-400" : "text-[#A0A0A0]"
          )}>
            {credits.balance.toLocaleString()}
          </p>
        </div>
        <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              usedPct > 85 ? "bg-red-400"
              : usedPct > 60 ? "bg-yellow-400"
              : "bg-[#38BDF8]"
            )}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Upgrade arrow — only when low */}
      {isLow && (
        <ArrowUpRight className="w-3 h-3 text-yellow-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
      )}
    </Link>
  );
}
```

---

## FILE 5 — Wire CreditsBadge into Sidebar (components/layout/Sidebar.tsx)

Add these lines at the bottom of the sidebar, just above the user avatar row:

```tsx
import { CreditsBadge } from "@/components/layout/CreditsBadge";

// Inside the sidebar <div> bottom section — after nav links, before user row:
<div className="py-2 border-t border-[#1A1A1A]">
  <CreditsBadge />
</div>
```

---

## COMPLETION CHECKLIST

### API — GET /api/settings/usage
- [ ] Returns org: plan, billing_cycle, credits_balance, credits_used, credits_monthly, cycle_resets_at
- [ ] this_cycle: email_reveals, phone_reveals, credits_burnt (counted since last cycle_resets_at)
- [ ] Paginated credit_transactions: 25/page, order created_at DESC
- [ ] member_breakdown: only returned when member_role = owner or admin
- [ ] member_breakdown sorted by credits DESC

### UsageStatsClient — /settings/usage page
- [ ] Balance card: large balance number, "/ monthly" denominator, renews-at date string
- [ ] Balance turns yellow when under 15% remaining (isLow)
- [ ] Progress bar: blue → yellow (>70% used) → red (>90% used)
- [ ] "Running low · Upgrade →" link visible when isLow
- [ ] 3 stat cards: email reveals, phone reveals, credits spent (with credit totals as sub-text)
- [ ] Credit explainer banner: "Email = 1 credit · Phone+Email = 8 credits · never expire"
- [ ] Per-member bar chart: only visible to admin/owner, relative bars, shows emails + phones
- [ ] Transaction table: Date | Type (human label) | Notes | Amount (±, bold) | Balance after
- [ ] Debit amounts shown as "−8", credits as "+200" in different colours
- [ ] Pagination: ChevronLeft/Right, page X / Y shown between buttons
- [ ] Refresh button top-right reloads data without page reload

### CreditsBadge (Sidebar widget)
- [ ] Fetches /api/settings/usage on mount (lightweight — only reads org.credits_balance)
- [ ] Shows balance number + mini progress bar
- [ ] Bar colour: blue (healthy) → yellow (>60% used) → red (>85% used)
- [ ] Turns yellow text + shows hover ArrowUpRight when under 15% remaining
- [ ] Clickable — links to /settings/usage
- [ ] Wired into Sidebar.tsx above the user avatar row
- [ ] Shows skeleton pulse while loading, null if error (silent fail)

## BUILD LOG ENTRY
## M11-04 Usage & Credits — [date]
### Files: UsageStatsPage, GET /api/settings/usage, UsageStatsClient, CreditsBadge sidebar widget
### M11-SETTINGS COMPLETE — All 4 tasks done (01 profile, 02 mailbox, 03 team, 04 usage)
### Status: ✅ Complete
