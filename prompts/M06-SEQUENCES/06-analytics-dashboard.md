<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 06: SEQUENCE ANALYTICS DASHBOARD
# Trae: Read CLAUDE.md first.
# The analytics view shows per-sequence performance:
# delivery rate, open rate, click rate, reply rate, bounce rate.
# Also shows per-step funnel and top-performing subject lines.
# Accessible at /sequences/[id]/analytics
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build sequence analytics:
1. GET /api/sequences/[id]/analytics — compute metrics from DB
2. SequenceAnalyticsDashboard component — metrics cards + step funnel
3. StepFunnelChart — visual step-by-step dropoff
4. EnrollmentTable — list all enrollments with status + last action
5. Export to CSV button

---

## FILE 1 — app/api/sequences/[id]/analytics/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sid = params.id;

  // Enrollment status breakdown
  const { data: statusCounts } = await supabase.rpc("get_enrollment_status_counts", {
    p_sequence_id: sid
  });

  // Per-step metrics
  const { data: stepMetrics } = await supabase.rpc("get_step_metrics", {
    p_sequence_id: sid
  });

  // Overall sequence record
  const { data: sequence } = await supabase
    .from("sequences")
    .select("id, title, enrolled_count, reply_count, step_count, status")
    .eq("id", sid)
    .single();

  // Recent enrollments list
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select(`
      id, status, current_step, emails_sent, emails_opened,
      links_clicked, replied_at, last_sent_at, created_at,
      candidates:candidate_id ( full_name, email, current_company )
    `)
    .eq("sequence_id", sid)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    sequence:    sequence ?? {},
    statusCounts: statusCounts ?? [],
    stepMetrics:  stepMetrics ?? [],
    enrollments:  (enrollments ?? []).map((e: any) => ({
      id:            e.id,
      status:        e.status,
      current_step:  e.current_step,
      emails_sent:   e.emails_sent,
      emails_opened: e.emails_opened,
      links_clicked: e.links_clicked,
      replied_at:    e.replied_at,
      last_sent_at:  e.last_sent_at,
      enrolled_at:   e.created_at,
      candidate_name: e.candidates?.full_name,
      candidate_email: e.candidates?.email,
      candidate_company: e.candidates?.current_company,
    })),
  });
}
```

---

## FILE 2 — Supabase SQL: analytics RPCs

```sql
-- Status breakdown
CREATE OR REPLACE FUNCTION get_enrollment_status_counts(p_sequence_id UUID)
RETURNS TABLE(status TEXT, count BIGINT) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT status::TEXT, COUNT(*) as count
  FROM sequence_enrollments
  WHERE sequence_id = p_sequence_id
  GROUP BY status
  ORDER BY count DESC;
$$;

-- Per-step metrics
CREATE OR REPLACE FUNCTION get_step_metrics(p_sequence_id UUID)
RETURNS TABLE(
  step_number INTEGER,
  subject     TEXT,
  sent        BIGINT,
  delivered   BIGINT,
  opened      BIGINT,
  clicked     BIGINT,
  bounced     BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    sel.step_number,
    ss.subject,
    COUNT(*) FILTER (WHERE sel.status IN ('sent','delivered','opened','clicked','bounced')) as sent,
    COUNT(*) FILTER (WHERE sel.status IN ('delivered','opened','clicked')) as delivered,
    COUNT(*) FILTER (WHERE sel.opened_at IS NOT NULL) as opened,
    COUNT(*) FILTER (WHERE sel.clicked_at IS NOT NULL) as clicked,
    COUNT(*) FILTER (WHERE sel.status = 'bounced') as bounced
  FROM sequence_email_logs sel
  JOIN sequence_steps ss ON ss.id = sel.step_id
  WHERE sel.sequence_id = p_sequence_id
  GROUP BY sel.step_number, ss.subject
  ORDER BY sel.step_number;
$$;
```

---

## FILE 3 — app/(app)/sequences/[id]/analytics/page.tsx

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SequenceAnalyticsDashboard } from "./SequenceAnalyticsDashboard";

export default async function SequenceAnalyticsPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { notFound(); }

  const res  = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sequences/${params.id}/analytics`, {
    cache: "no-store",
    headers: { cookie: "" },  // server fetch
  });
  const data = res.ok ? await res.json() : null;
  if (!data?.sequence?.id) notFound();

  return <SequenceAnalyticsDashboard data={data} sequenceId={params.id} />;
}
```

---

## FILE 4 — app/(app)/sequences/[id]/analytics/SequenceAnalyticsDashboard.tsx

```tsx
"use client";
import { useMemo } from "react";
import { ArrowLeft, Download, Mail, Eye, MousePointer, MessageSquare,
         AlertTriangle, Users, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  pending:      "text-[#A0A0A0] bg-[#1A1A1A]",
  in_progress:  "text-blue-400 bg-blue-400/10",
  completed:    "text-green-400 bg-green-400/10",
  replied:      "text-[#38BDF8] bg-[#38BDF8]/10",
  stopped:      "text-orange-400 bg-orange-400/10",
  bounced:      "text-red-400 bg-red-400/10",
  unsubscribed: "text-[#555555] bg-[#111111]",
};

interface Props {
  data:         any;
  sequenceId:   string;
}

export function SequenceAnalyticsDashboard({ data, sequenceId }: Props) {
  const router = useRouter();
  const { sequence, stepMetrics, enrollments } = data;

  const totals = useMemo(() => {
    const total = enrollments.length;
    if (total === 0) return { sent: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 };
    const sent    = enrollments.filter((e: any) => e.emails_sent > 0).length;
    const opened  = enrollments.filter((e: any) => e.emails_opened > 0).length;
    const clicked = enrollments.filter((e: any) => e.links_clicked > 0).length;
    const replied = enrollments.filter((e: any) => e.replied_at).length;
    const bounced = enrollments.filter((e: any) => e.status === "bounced").length;
    return {
      total,
      sent,
      openRate:   sent  > 0 ? Math.round((opened  / sent) * 100) : 0,
      clickRate:  sent  > 0 ? Math.round((clicked / sent) * 100) : 0,
      replyRate:  total > 0 ? Math.round((replied / total) * 100) : 0,
      bounceRate: sent  > 0 ? Math.round((bounced / sent) * 100) : 0,
    };
  }, [enrollments]);

  const exportCSV = () => {
    const headers = ["Name", "Email", "Company", "Status", "Emails Sent", "Opened", "Clicked", "Replied At", "Enrolled At"];
    const rows = enrollments.map((e: any) => [
      e.candidate_name, e.candidate_email, e.candidate_company ?? "",
      e.status, e.emails_sent, e.emails_opened > 0 ? "Yes" : "No",
      e.links_clicked > 0 ? "Yes" : "No",
      e.replied_at ? new Date(e.replied_at).toLocaleDateString("en-IN") : "",
      new Date(e.enrolled_at).toLocaleDateString("en-IN"),
    ]);
    const csv  = [headers, ...rows].map(r => r.join(",")).join("
");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = `${sequence.title}-analytics.csv`; a.click();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/sequences/${sequenceId}/edit`)}
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#FAFAFA]">{sequence.title}</h1>
            <p className="text-xs text-[#555555]">Sequence analytics · {sequence.step_count} steps</p>
          </div>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#222222] text-xs text-[#A0A0A0] hover:border-[#333333] hover:text-[#FAFAFA] transition-all">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Enrolled",   value: totals.total ?? 0, suffix: "",  icon: Users,         color: "text-[#38BDF8]"  },
          { label: "Open rate",  value: totals.openRate,   suffix: "%", icon: Eye,           color: "text-purple-400" },
          { label: "Click rate", value: totals.clickRate,  suffix: "%", icon: MousePointer,  color: "text-yellow-400" },
          { label: "Reply rate", value: totals.replyRate,  suffix: "%", icon: MessageSquare, color: "text-green-400"  },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-[#555555] font-medium uppercase tracking-wider">{kpi.label}</p>
              <kpi.icon className={cn("w-4 h-4", kpi.color)} />
            </div>
            <p className="text-2xl font-bold text-[#FAFAFA]">
              {kpi.value}{kpi.suffix}
            </p>
          </div>
        ))}
      </div>

      {/* Step funnel */}
      {stepMetrics?.length > 0 && (
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Step funnel</h2>
          <div className="space-y-3">
            {stepMetrics.map((step: any, idx: number) => {
              const openPct  = step.sent > 0 ? Math.round((step.opened  / step.sent) * 100) : 0;
              const clickPct = step.sent > 0 ? Math.round((step.clicked / step.sent) * 100) : 0;
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-[10px] font-bold text-[#38BDF8]">
                        {step.step_number}
                      </div>
                      <p className="text-xs text-[#A0A0A0] truncate max-w-[280px]">{step.subject}</p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#555555]">
                      <span>{step.sent} sent</span>
                      <span className="text-purple-400">{openPct}% open</span>
                      <span className="text-yellow-400">{clickPct}% click</span>
                    </div>
                  </div>
                  {/* Open rate bar */}
                  <div className="h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400/60 rounded-full" style={{ width: `${openPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Enrollment table */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Enrollments ({enrollments.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                {["Candidate", "Status", "Steps sent", "Opened", "Replied", "Enrolled"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] text-[#555555] uppercase tracking-wider font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrollments.slice(0, 25).map((e: any) => (
                <tr key={e.id} className="border-b border-[#0D0D0D] hover:bg-[#0D0D0D] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[#FAFAFA] font-medium">{e.candidate_name}</p>
                    <p className="text-[#555555] text-[10px]">{e.candidate_company}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-medium", STATUS_COLOR[e.status] ?? "text-[#555555] bg-[#111111]")}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#A0A0A0]">{e.emails_sent}/{e.emails_sent + (e.current_step > e.emails_sent ? 1 : 0)}</td>
                  <td className="px-4 py-3">
                    {e.emails_opened > 0
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      : <span className="text-[#333333]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.replied_at
                      ? <span className="text-[#38BDF8] text-[10px]">{new Date(e.replied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      : <span className="text-[#333333]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#555555]">
                    {new Date(e.enrolled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {enrollments.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-xs text-[#555555]">No enrollments yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] get_enrollment_status_counts RPC: status breakdown
- [ ] get_step_metrics RPC: per-step sent/delivered/opened/clicked/bounced
- [ ] GET /api/sequences/[id]/analytics: returns sequence, statusCounts, stepMetrics, enrollments
- [ ] SequenceAnalyticsDashboard: 4 KPI cards (enrolled, open rate, click rate, reply rate)
- [ ] Step funnel: progress bar per step showing open % and click %
- [ ] Enrollment table: name, status badge, steps sent, opened, replied date, enrolled date
- [ ] Export CSV: downloads full enrollment list with all fields
- [ ] Page accessible at /sequences/[id]/analytics (linked from /sequences/[id]/edit top bar)

## BUILD LOG ENTRY
## M06-06 Analytics Dashboard — [date]
### Files: analytics SQL RPCs, GET analytics API, SequenceAnalyticsDashboard
### M06 COMPLETE ✅ — All 6 files done
### Status: ✅ Complete
