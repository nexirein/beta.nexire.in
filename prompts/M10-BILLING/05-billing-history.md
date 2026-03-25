<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 05: BILLING HISTORY
# Trae: Read CLAUDE.md first.
# Billing history page at /settings/billing shows all invoices,
# payments, credit top-ups, and plan activations for NEXIRE v5.0.
# Each payment has a downloadable HTML receipt.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. GET /api/billing/history — list billing events for the org
2. GET /api/billing/history/[id]/receipt — generate downloadable HTML receipt (v5.0 design)
3. BillingHistoryPage — paginated table with download button
4. BillingOverviewCard — current plan + renewal date + quick actions

---

## FILE 1 — app/api/billing/history/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Number(searchParams.get("page") ?? 1);
  const limit = 20;

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: events, count } = await supabase
    .from("billing_events")
    .select(
      "id, event_type, plan_id, billing_cycle, amount_paise, razorpay_payment_id, razorpay_order_id, created_at",
      { count: "exact" }
    )
    .eq("org_id", profile?.org_id)
    .in("event_type", ["payment_success", "refund_created", "subscription_charged", "credits_topup"])
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  return NextResponse.json({ events: events ?? [], total: count ?? 0, page, limit });
}
```

---

## FILE 2 — app/api/billing/history/[id]/receipt/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: event } = await supabase
    .from("billing_events")
    .select("*, orgs(name, gst_number)")
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)
    .single();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const amountINR = ((event.amount_paise ?? 0) / 100).toLocaleString("en-IN", {
    style: "currency", currency: "INR",
  });
  const receiptDate = new Date(event.created_at).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const receiptNo = `NXR-${params.id.slice(0, 8).toUpperCase()}`;
  const orgName   = (event as any).orgs?.name ?? "Your Organisation";
  const gst       = (event as any).orgs?.gst_number ?? "";
  
  const plan = event.plan_id ? PLANS[event.plan_id as keyof typeof PLANS] : null;
  const planLabel = plan
    ? `${plan.name} Plan (${event.billing_cycle ?? "monthly"})`
    : "Contact Credits Top-Up";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt ${receiptNo} — Nexire</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f9f9f9; color: #111; padding: 40px;
    }
    .card {
      background: #fff; max-width: 600px; margin: 0 auto;
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .header {
      background: #0A0A0A;
      padding: 32px; color: #fff;
    }
    .header h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p  { font-size: 11px; opacity: 0.5; margin-top: 4px; }
    .body  { padding: 32px; }
    .meta  { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
    .meta-item .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 4px; font-weight: 600; }
    .meta-item .value { font-size: 13px; color: #111; font-weight: 500; line-height: 1.4; }
    .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    .line { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; font-size: 13px; }
    .total { display: flex; justify-content: space-between; padding: 16px 0; margin-top: 8px; border-top: 2px solid #0EA5E9; }
    .total .label { font-size: 14px; font-weight: 700; }
    .total .amount { font-size: 22px; font-weight: 800; color: #0EA5E9; }
    .status { display: inline-flex; align-items: center; gap: 6px; background: #ECFDF5; color: #059669; font-size: 10px; font-weight: 700; padding: 5px 12px; border-radius: 999px; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.02em; }
    .footer { background: #fafafa; padding: 20px 32px; font-size: 10px; color: #999; line-height: 1.6; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Nexire</h1>
      <p>NEXIRE TECHNOLOGIES PVT. LTD. &nbsp;·&nbsp; support@nexire.in</p>
    </div>
    <div class="body">
      <div class="status">
        <span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block"></span>
        Payment Received
      </div>
      <div class="meta">
        <div class="meta-item">
          <div class="label">Receipt Number</div>
          <div class="value" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${receiptNo}</div>
        </div>
        <div class="meta-item">
          <div class="label">Payment Date</div>
          <div class="value">${receiptDate}</div>
        </div>
        <div class="meta-item">
          <div class="label">Billed To</div>
          <div class="value">
            ${orgName}
            ${gst ? `<div style="font-size:11px;color:#666;margin-top:2px">GST: ${gst}</div>` : ""}
          </div>
        </div>
        <div class="meta-item">
          <div class="label">Transaction ID</div>
          <div class="value" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#666">${event.razorpay_payment_id ?? "—"}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="line">
        <span style="font-weight:500;color:#333">${planLabel}</span>
        <span style="font-weight:600">${amountINR}</span>
      </div>
      <div class="line" style="font-size:11px;color:#999;padding-top:0">
        <span>GST (18%)</span>
        <span>Included</span>
      </div>
      <div class="total">
        <span class="label">Total Amount Paid</span>
        <span class="amount">${amountINR}</span>
      </div>
    </div>
    <div class="footer">
      This is a computer-generated receipt and does not require a physical signature.<br>
      Nexire Technologies Pvt. Ltd. &nbsp;·&nbsp; Mumbai, MH, India<br>
      For any billing queries, please contact support@nexire.in
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type":        "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexire-receipt-${receiptNo}.html"`,
    },
  });
}
```

---

## FILE 3 — app/(app)/settings/billing/BillingHistoryPage.tsx

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Download, CreditCard, RefreshCw, Zap,
  ChevronLeft, ChevronRight, FileText
} from "lucide-react";
import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const EVENT_META: Record<string, { label: string; color: string; icon: any }> = {
  payment_success:      { label: "Plan payment",   color: "text-green-400 bg-green-400/10 border-green-400/20",   icon: CreditCard  },
  subscription_charged: { label: "Subscription",   color: "text-green-400 bg-green-400/10 border-green-400/20",   icon: RefreshCw   },
  refund_created:       { label: "Refund",          color: "text-red-400 bg-red-400/10 border-red-400/20",         icon: RefreshCw   },
  credits_topup:        { label: "Credit top-up",  color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: Zap         },
};

export function BillingHistoryPage() {
  const [events, setEvents]   = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/billing/history?page=${page}`);
    const data = await res.json();
    setEvents(data.events ?? []);
    setTotal(data.total   ?? 0);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#FAFAFA]">Transaction History</h3>
        <span className="text-[10px] text-[#555555] font-mono">{total} total</span>
      </div>

      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1A1A1A] bg-[#0D0D0D]">
              {["Status", "Item", "Amount", "Date", ""].map(h => (
                <th key={h} className="px-6 py-4 text-left text-[10px] text-[#555555] uppercase tracking-wider font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-[#0D0D0D]">
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-6 py-5">
                      <div className="h-3 bg-[#1A1A1A] rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <FileText className="w-10 h-10 text-[#222222] mx-auto mb-3" />
                  <p className="text-xs text-[#555555]">No transactions found</p>
                </td>
              </tr>
            ) : events.map(ev => {
              const meta   = EVENT_META[ev.event_type] ?? EVENT_META.payment_success;
              const Icon   = meta.icon;
              const amtINR = ev.amount_paise
                ? `₹${(ev.amount_paise / 100).toLocaleString("en-IN")}`
                : "—";
              
              const plan = ev.plan_id ? PLANS[ev.plan_id as keyof typeof PLANS] : null;
              const planLabel = plan
                ? `${plan.name}${ev.billing_cycle === "yearly" ? " (Annual)" : ""}`
                : "Credits Top-Up";

              return (
                <tr key={ev.id} className="border-b border-[#0D0D0D] hover:bg-[#0D0D0D] transition-colors group">
                  <td className="px-6 py-5">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-tight",
                      meta.color
                    )}>
                      <Icon className="w-3 h-3" /> {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-[#FAFAFA] font-medium">{planLabel}</td>
                  <td className="px-6 py-5 text-[#FAFAFA] font-bold">{amtINR}</td>
                  <td className="px-6 py-5 text-[#555555]">
                    {new Date(ev.created_at).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <a
                      href={`/api/billing/history/${ev.id}/receipt`}
                      download
                      className="p-2 rounded-xl text-[#333333] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all inline-flex items-center justify-center"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#1A1A1A] bg-[#0D0D0D]">
            <p className="text-[10px] text-[#555555] font-medium uppercase">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-20 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-20 transition-all"
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

## COMPLETION CHECKLIST
- [ ] GET /api/billing/history: correctly filters events for v5.0 strategy
- [ ] GET /api/billing/history/[id]/receipt: generates HTML receipt with new Nexire branding
- [ ] BillingHistoryPage: displays Solo/Growth/Credits correctly
- [ ] BillingHistoryPage: uses v5.0 UI components and colors
- [ ] Receipt: includes GST number from orgs table if present
- [ ] Pagination: functional with font-mono total count

## BUILD LOG ENTRY
## M10-05 Billing History v5.0 — [date]
### Files: GET /api/billing/history, receipt generator, BillingHistoryPage UI
### Status: ✅ Complete
