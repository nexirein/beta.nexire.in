<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 06: OVERAGE MODAL
# Trae: Read CLAUDE.md first.
# The OverageModal appears whenever a user tries to reveal contact info
# but has insufficient credits. It shows top-up packs + plan upgrade options.
# This is a KEY revenue conversion touchpoint — design it to convert.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build OverageModal:
1. Triggered when credit balance < 1 (or < required amount for bulk reveal)
2. Shows 3 one-time top-up packs (₹499 / ₹1,499 / ₹3,499)
3. Shows plan upgrade CTA ("Upgrade to Solo — ₹999/mo, 100 credits")
4. "Credit meter" visual showing current balance vs plan limit
5. Animated entrance (scale + fade)
6. Dismissable with ESC or backdrop click

---

## DESIGN SPEC
Modal: max-w-md bg-[#111111] border-[#333333] rounded-2xl
Header: orange zap icon + "Out of credits" + current balance subtitle
Credit meter: thin progress bar showing X/plan_limit credits used
Top-up packs: 3 option cards, "Most popular" badge on middle option
Plan upgrade: below packs, subtle separator, upgrade button
CTA button: gradient blue "Top up" → goes to /billing?topup=N

---

## FILE — components/reveal/OverageModal.tsx

```tsx
"use client";
import { useEffect } from "react";
import { Zap, X, ArrowRight, Crown, TrendingUp, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface TopUpPack {
  credits:   number;
  priceInr:  number;
  label:     string;
  popular:   boolean;
  perCredit: number;
}

const TOP_UP_PACKS: TopUpPack[] = [
  { credits: 25,  priceInr: 499,  label: "Starter", popular: false, perCredit: 19.96 },
  { credits: 100, priceInr: 1499, label: "Growth",  popular: true,  perCredit: 14.99 },
  { credits: 300, priceInr: 3499, label: "Scale",   popular: false, perCredit: 11.66 },
];

const PLAN_UPGRADES = [
  {
    name:      "Solo",
    priceInr:  999,
    credits:   100,
    highlights: ["100 credits/month", "Unlimited searches", "Email sequences"],
  },
  {
    name:      "Growth",
    priceInr:  2499,
    credits:   500,
    highlights: ["500 credits/month", "5 team seats", "Client share links"],
  },
];

interface OverageModalProps {
  open:             boolean;
  onClose:          () => void;
  currentBalance:   number;
  planCreditLimit?: number;
  planName?:        string;
  requiredCredits?: number;
}

export function OverageModal({
  open,
  onClose,
  currentBalance,
  planCreditLimit = 10,
  planName = "Free",
  requiredCredits = 1,
}: OverageModalProps) {
  const router = useRouter();

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const usedCredits     = Math.max(0, planCreditLimit - currentBalance);
  const usagePercent    = planCreditLimit > 0 ? (usedCredits / planCreditLimit) * 100 : 100;
  const isOnFreePlan    = planName === "Free";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-md shadow-[0_30px_100px_rgba(0,0,0,0.8)] animate-scale-in overflow-hidden">

        {/* Top accent */}
        <div className="h-0.5 w-full bg-gradient-to-r from-orange-400/0 via-orange-400 to-orange-400/0" />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#FAFAFA]">
                {requiredCredits > currentBalance
                  ? `Need ${requiredCredits} credit${requiredCredits > 1 ? "s" : ""}`
                  : "Out of credits"}
              </h2>
              <p className="text-xs text-[#555555] mt-0.5">
                You have <span className="text-orange-400 font-medium">{currentBalance}</span> credit{currentBalance !== 1 ? "s" : ""} remaining on the {planName} plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all flex-shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Credit meter */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between text-[10px] text-[#555555] mb-1.5">
            <span>Credits used this month</span>
            <span>{usedCredits} / {planCreditLimit}</span>
          </div>
          <div className="h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                usagePercent >= 90 ? "bg-gradient-to-r from-orange-400 to-red-400"
                                   : "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9]"
              )}
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1A1A1A] mx-6" />

        {/* Top-up packs */}
        <div className="px-6 py-4">
          <p className="text-[11px] text-[#555555] font-medium uppercase tracking-wider mb-3">
            One-time top-up
          </p>
          <div className="space-y-2">
            {TOP_UP_PACKS.map(pack => (
              <button
                key={pack.credits}
                onClick={() => {
                  router.push(`/billing?topup=${pack.credits}`);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all group",
                  pack.popular
                    ? "bg-[#38BDF8]/5 border-[#38BDF8]/30 hover:border-[#38BDF8]/60 hover:bg-[#38BDF8]/10"
                    : "bg-[#0A0A0A] border-[#222222] hover:border-[#444444] hover:bg-[#111111]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-semibold",
                        pack.popular ? "text-[#38BDF8]" : "text-[#FAFAFA]"
                      )}>
                        {pack.credits} credits
                      </span>
                      {pack.popular && (
                        <span className="text-[10px] bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20 px-1.5 py-0.5 rounded-md font-medium">
                          Best value
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#555555] mt-0.5">
                      ₹{pack.perCredit.toFixed(2)} per credit
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={cn("text-sm font-bold", pack.popular ? "text-[#38BDF8]" : "text-[#FAFAFA]")}>
                      ₹{pack.priceInr.toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] text-[#555555]">one-time</p>
                  </div>
                  <ArrowRight className={cn(
                    "w-4 h-4 transition-colors",
                    pack.popular ? "text-[#38BDF8]/50 group-hover:text-[#38BDF8]" : "text-[#333333] group-hover:text-[#A0A0A0]"
                  )} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Plan upgrade (only on Free plan) */}
        {isOnFreePlan && (
          <>
            <div className="flex items-center gap-3 px-6 pb-3">
              <div className="flex-1 h-px bg-[#1A1A1A]" />
              <span className="text-[10px] text-[#333333] uppercase tracking-wider">or upgrade your plan</span>
              <div className="flex-1 h-px bg-[#1A1A1A]" />
            </div>

            <div className="px-6 pb-5 space-y-2">
              {PLAN_UPGRADES.map(plan => (
                <button
                  key={plan.name}
                  onClick={() => {
                    router.push(`/billing?plan=${plan.name.toLowerCase()}`);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#222222] bg-[#0A0A0A] hover:border-[#38BDF8]/30 hover:bg-[#38BDF8]/5 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <Crown className="w-4 h-4 text-[#38BDF8]" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[#FAFAFA]">{plan.name} plan</p>
                      <p className="text-[10px] text-[#555555]">
                        {plan.highlights.join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#38BDF8]">₹{plan.priceInr.toLocaleString("en-IN")}</p>
                      <p className="text-[10px] text-[#555555]">/month</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#333333] group-hover:text-[#38BDF8] transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1A1A1A] bg-[#0A0A0A]">
          <button
            onClick={() => { router.push("/billing"); onClose(); }}
            className="w-full text-center text-xs text-[#555555] hover:text-[#A0A0A0] transition-colors"
          >
            View all billing options →
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 2 — tailwind.config.ts: add scale-in animation

```typescript
// Add to theme.extend.keyframes:
"scale-in": {
  from: { opacity: "0", transform: "scale(0.95)" },
  to:   { opacity: "1", transform: "scale(1)" }
},

// Add to theme.extend.animation:
"scale-in": "scale-in 0.15s ease-out",
```

---

## USAGE EXAMPLE — How to trigger OverageModal in CandidateSlideOver

```tsx
// In CandidateSlideOver.tsx, replace the toast error with:
const [overageOpen, setOverageOpen] = useState(false);

// In EmailRevealButton onError handler:
if (error === "INSUFFICIENT_CREDITS") {
  setOverageOpen(true);
  return;
}

// In JSX:
<OverageModal
  open={overageOpen}
  onClose={() => setOverageOpen(false)}
  currentBalance={creditsBalance}
  planCreditLimit={planData?.credit_limit ?? 10}
  planName={planData?.plan_tier ?? "Free"}
/>
```

---

## COMPLETION CHECKLIST
- [ ] OverageModal renders with orange accent header + Zap icon
- [ ] Credit meter shows usage % (red gradient when >90% used)
- [ ] 3 top-up packs: ₹499 / ₹1,499 / ₹3,499 with per-credit price
- [ ] "Best value" badge on middle pack (₹1,499)
- [ ] Plan upgrade section shown only on Free plan
- [ ] Solo (₹999/mo) and Growth (₹2,499/mo) upgrade options
- [ ] ESC key closes modal
- [ ] scale-in animation on mount
- [ ] Redirect to /billing?topup=N or /billing?plan=solo on click

## BUILD LOG ENTRY
## M04-06 Overage Modal — [date]
### File: components/reveal/OverageModal.tsx
### M04 COMPLETE ✅ — All 6 files built
### Status: ✅ Complete
