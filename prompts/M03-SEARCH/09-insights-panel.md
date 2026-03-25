<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 09: INSIGHTS PANEL (AI-Powered Search Analytics)
# Trae: Read CLAUDE.md first.
# The InsightsPanel is a right-side collapsible panel on the search page.
# It shows: skill demand heatmap, location distribution, experience breakdown,
# top companies in results, and AI suggestions to refine the search.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build InsightsPanel component:
- Collapsible panel (280px wide, right of results grid)
- Skill frequency bar chart (top 10 skills in current results)
- Location breakdown (top 5 cities)
- Experience distribution (0-2, 2-5, 5-10, 10+ yrs)
- Top companies in results
- AI Tip: "Broaden to X to get 3x more results" (rule-based, not LLM)
- Refreshes whenever search results change

---

## DESIGN SPEC
Panel: bg-[#0D0D0D] border-l border-[#1A1A1A] w-72 flex-shrink-0
Section headers: text-[10px] text-[#555555] uppercase tracking-widest font-semibold
Bar fill: bg-gradient-to-r from-[#38BDF8]/60 to-[#38BDF8]/20
Company pill: bg-[#111111] border border-[#222222] rounded-xl text-xs
AI tip card: bg-[#38BDF8]/5 border border-[#38BDF8]/20 rounded-xl

---

## FILE — components/search/InsightsPanel.tsx

```tsx
"use client";
import { useMemo } from "react";
import { Lightbulb, TrendingUp, MapPin, Briefcase, Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface InsightsPanelProps {
  results: any[];
  filters: any;
  open: boolean;
  onApplySuggestion: (suggestion: Partial<any>) => void;
}

interface BarItemProps {
  label: string;
  count: number;
  max: number;
  color?: string;
}

function BarItem({ label, count, max, color = "#38BDF8" }: BarItemProps) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-[11px] text-[#A0A0A0] w-24 truncate flex-shrink-0 group-hover:text-[#FAFAFA] transition-colors">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color}33)`,
          }}
        />
      </div>
      <span className="text-[10px] text-[#555555] w-5 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3 h-3 text-[#555555]" />
        <span className="text-[10px] text-[#555555] uppercase tracking-widest font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function InsightsPanel({ results, filters, open, onApplySuggestion }: InsightsPanelProps) {
  const insights = useMemo(() => {
    if (!results.length) return null;

    // Skill frequency
    const skillCount: Record<string, number> = {};
    results.forEach(r => (r.skills ?? []).forEach((s: string) => {
      skillCount[s] = (skillCount[s] ?? 0) + 1;
    }));
    const topSkills = Object.entries(skillCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Location distribution
    const locCount: Record<string, number> = {};
    results.forEach(r => {
      if (r.location) locCount[r.location] = (locCount[r.location] ?? 0) + 1;
    });
    const topLocs = Object.entries(locCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Experience bands
    const expBands = { "0–2 yrs": 0, "2–5 yrs": 0, "5–10 yrs": 0, "10+ yrs": 0 };
    results.forEach(r => {
      const y = r.experience_years ?? 0;
      if (y < 2)       expBands["0–2 yrs"]++;
      else if (y < 5)  expBands["2–5 yrs"]++;
      else if (y < 10) expBands["5–10 yrs"]++;
      else             expBands["10+ yrs"]++;
    });

    // Top companies
    const coCount: Record<string, number> = {};
    results.forEach(r => {
      if (r.current_company) coCount[r.current_company] = (coCount[r.current_company] ?? 0) + 1;
    });
    const topCompanies = Object.entries(coCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // AI tip: suggest removing most restrictive filter
    let aiTip: { text: string; action?: Partial<any> } | null = null;
    const currentSkillCount = filters?.skills?.length ?? 0;
    if (results.length < 10 && currentSkillCount > 2) {
      const leastCommon = topSkills[topSkills.length - 1]?.[0];
      aiTip = {
        text: `Remove "${leastCommon}" to find more candidates`,
        action: { skills: filters.skills.filter((s: string) => s !== leastCommon) },
      };
    } else if (results.length < 20 && filters?.exp_min > 0) {
      aiTip = {
        text: `Lowering min experience to ${Math.max(0, filters.exp_min - 2)} yrs could 2x results`,
        action: { exp_min: Math.max(0, filters.exp_min - 2) },
      };
    } else if (results.length > 80) {
      aiTip = { text: `Add 1 more skill to narrow down from ${results.length} candidates` };
    }

    return { topSkills, topLocs, expBands, topCompanies, aiTip };
  }, [results, filters]);

  if (!open) return null;

  return (
    <aside className="w-72 flex-shrink-0 border-l border-[#1A1A1A] bg-[#0D0D0D] overflow-y-auto">
      <div className="px-4 py-4 border-b border-[#1A1A1A]">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">Insights</h3>
          <span className="ml-auto text-[10px] text-[#555555]">{results.length} results</span>
        </div>
      </div>

      {!insights && (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-[#555555]">Run a search to see insights</p>
        </div>
      )}

      {insights && (
        <div className="px-4 py-4">

          {/* AI Tip */}
          {insights.aiTip && (
            <div className="bg-[#38BDF8]/5 border border-[#38BDF8]/20 rounded-xl p-3 mb-5">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-[#38BDF8] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[#A0A0A0] leading-relaxed">{insights.aiTip.text}</p>
                  {insights.aiTip.action && (
                    <button
                      onClick={() => onApplySuggestion(insights.aiTip!.action!)}
                      className="mt-2 flex items-center gap-1 text-[11px] text-[#38BDF8] hover:text-[#0EA5E9] transition-colors"
                    >
                      Apply <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Top Skills */}
          <Section icon={TrendingUp} title="Top Skills">
            <div className="space-y-2">
              {insights.topSkills.map(([skill, count]) => (
                <BarItem key={skill} label={skill} count={count} max={insights.topSkills[0][1]} />
              ))}
            </div>
          </Section>

          {/* Locations */}
          {insights.topLocs.length > 0 && (
            <Section icon={MapPin} title="Locations">
              <div className="space-y-2">
                {insights.topLocs.map(([loc, count]) => (
                  <BarItem key={loc} label={loc} count={count} max={insights.topLocs[0][1]} color="#A78BFA" />
                ))}
              </div>
            </Section>
          )}

          {/* Experience Bands */}
          <Section icon={Briefcase} title="Experience">
            <div className="space-y-2">
              {Object.entries(insights.expBands).map(([band, count]) => (
                <BarItem key={band} label={band} count={count} max={Math.max(...Object.values(insights.expBands))} color="#34D399" />
              ))}
            </div>
          </Section>

          {/* Top Companies */}
          {insights.topCompanies.length > 0 && (
            <Section icon={Building2} title="Companies">
              <div className="flex flex-wrap gap-1.5">
                {insights.topCompanies.map(([co, count]) => (
                  <span key={co} className="flex items-center gap-1 text-[11px] text-[#A0A0A0] bg-[#111111] border border-[#222222] rounded-lg px-2 py-1">
                    {co}
                    <span className="text-[#555555]">{count}</span>
                  </span>
                ))}
              </div>
            </Section>
          )}

        </div>
      )}
    </aside>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] InsightsPanel.tsx renders skill bars, location bars, exp bands, companies
- [ ] AI tip appears when results < 10 (suggests removing a skill) or > 80 (suggests adding one)
- [ ] "Apply" button on AI tip calls onApplySuggestion to update filters
- [ ] Panel is collapsible via `open` prop — wired to a toggle button in SearchPage
- [ ] All bars animate on mount (transition-all duration-500)

## BUILD LOG ENTRY
## M03-09 Insights Panel — [date]
### File: components/search/InsightsPanel.tsx
### Status: ✅ Complete
