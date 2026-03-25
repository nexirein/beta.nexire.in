"use client";
// nexire-app — app/(app)/billing/BillingClient.tsx
// Full billing page: plan details, credit usage, top-up packs + Razorpay SDK.

import { useState, useEffect, useCallback } from "react";
import { Zap, CreditCard, Star, Check, Loader2, TrendingUp, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OrgBilling {
  balance: number;
  monthly: number;
  plan: string;
}

interface TxRow {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

const TOPUP_PACKS = [
  { key: "small",  credits: 50,   price: "₹499",   per: "₹9.98/cr",  popular: false },
  { key: "medium", credits: 150,  price: "₹1,299", per: "₹8.66/cr",  popular: true  },
  { key: "large",  credits: 500,  price: "₹3,499", per: "₹6.99/cr",  popular: false },
  { key: "xl",     credits: 1000, price: "₹5,999", per: "₹5.99/cr",  popular: false },
] as const;

const TX_LABELS: Record<string, { label: string; color: string }> = {
  monthly_grant:  { label: "Monthly Grant",   color: "text-brand-400" },
  rollover:       { label: "Rollover",         color: "text-brand-400" },
  reveal_email:   { label: "Email Reveal",     color: "text-red-400" },
  reveal_phone:   { label: "Phone Reveal",     color: "text-red-400" },
  manual_topup:   { label: "Top-up",           color: "text-emerald-400" },
  refund:         { label: "Refund",           color: "text-emerald-400" },
  adjustment:     { label: "Adjustment",       color: "text-amber-400" },
};

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function BillingClient() {
  const [billing, setBilling]   = useState<OrgBilling | null>(null);
  const [txns, setTxns]         = useState<TxRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [buying, setBuying]     = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes] = await Promise.all([
        fetch("/api/credits/balance"),
      ]);
      const balData = await balRes.json();
      setBilling(balData);
    } catch { toast.error("Failed to load billing"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  async function handleTopup(pack: string) {
    setBuying(pack);
    try {
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) { toast.error("Failed to load payment SDK. Please check your connection."); return; }

      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "BILLING_NOT_CONFIGURED") {
          toast.error("Razorpay not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local");
        } else {
          toast.error(data.message ?? "Failed to create order");
        }
        return;
      }

      const { order_id, amount_paise, key_id, user_email, user_name, credits } = data;

      const rzp = new window.Razorpay({
        key:         key_id,
        amount:      amount_paise,
        currency:    "INR",
        name:        "Nexire",
        description: `${credits} Search Credits`,
        order_id,
        prefill: { name: user_name, email: user_email },
        theme: { color: "#6d28d9" },
        handler: async (response: { razorpay_payment_id: string }) => {
          toast.success(`Payment successful! ${credits} credits will appear shortly.`);
          console.log("[Billing] Payment success:", response.razorpay_payment_id);
          // Refetch balance after short delay (webhook may not have fired yet)
          setTimeout(() => fetchBilling(), 3000);
        },
      });
      rzp.open();
    } catch (err) {
      console.error("[Billing] Topup error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBuying(null);
    }
  }

  const usagePercent = billing
    ? Math.min(100, ((billing.monthly - billing.balance) / billing.monthly) * 100)
    : 0;

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Billing & Credits</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Manage your credits and top-up your balance.</p>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="card h-28 bg-[var(--surface-raised)]" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Balance card */}
          <div className="grid grid-cols-1 gap-4 mb-8">
            <div className="card">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-brand-400" />
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium">Balance</span>
              </div>
              <p className="text-3xl font-bold text-[var(--foreground)]">{billing?.balance ?? 0}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">credits available</p>
            </div>
          </div>

          {/* Plan info */}
          <div className="card mb-8 border-brand-500/20 bg-brand-500/5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-semibold text-[var(--foreground)] capitalize">{billing?.plan ?? "free"} Plan</span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {billing?.plan === "free"
                    ? `${billing.monthly} credits/month · Email reveal = 1cr · Phone = 8cr`
                    : `${billing?.monthly} credits/month included`}
                </p>
              </div>
              {billing?.plan === "free" && (
                <span className="badge text-xs border-brand-500/20 text-brand-400 bg-brand-500/10">Upgrade coming soon</span>
              )}
            </div>
          </div>

          {/* Top-up packs */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Top-up Credits</h2>
            <p className="text-xs text-[var(--muted)] mb-4">One-time top-ups, no subscription. Credits never expire.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TOPUP_PACKS.map(pack => (
                <div
                  key={pack.key}
                  className={cn(
                    "card relative flex flex-col transition-all",
                    pack.popular && "border-brand-500/30 bg-brand-500/5"
                  )}
                >
                  {pack.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="badge text-[10px] border-brand-500/30 text-brand-400 bg-[var(--surface)] whitespace-nowrap">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className={cn("w-4 h-4", pack.popular ? "text-brand-400" : "text-[var(--muted)]")} />
                    <span className="font-bold text-lg text-[var(--foreground)]">{pack.credits}</span>
                    <span className="text-xs text-[var(--muted)]">credits</span>
                  </div>
                  <p className="text-xl font-bold text-[var(--foreground)] mb-0.5">{pack.price}</p>
                  <p className="text-[11px] text-[var(--muted)] mb-4">{pack.per}</p>
                  <div className="mt-auto space-y-1.5 text-[11px] text-[var(--muted)]">
                    <div className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> {pack.credits} email reveals</div>
                    <div className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> {Math.floor(pack.credits / 8)} phone reveals</div>
                  </div>
                  <button
                    onClick={() => handleTopup(pack.key)}
                    disabled={!!buying}
                    className={cn(
                      "mt-4 w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                      pack.popular
                        ? "btn-primary"
                        : "border border-[var(--border)] text-[var(--foreground)] hover:border-brand-500/40 hover:bg-brand-500/5",
                      buying === pack.key && "opacity-70"
                    )}
                  >
                    {buying === pack.key ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                    ) : (
                      <><CreditCard className="w-3.5 h-3.5" /> Buy Now</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction history */}
          {txns.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Credit History</h2>
              <div className="card divide-y divide-[var(--border)] p-0 overflow-hidden">
                {txns.slice(0, 20).map(tx => {
                  const meta = TX_LABELS[tx.type] ?? { label: tx.type, color: "text-[var(--muted)]" };
                  return (
                    <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className={cn("text-sm font-medium", meta.color)}>{meta.label}</p>
                        {tx.notes && <p className="text-xs text-[var(--muted)] truncate max-w-xs">{tx.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-semibold tabular-nums", tx.amount > 0 ? "text-emerald-400" : "text-red-400")}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">→ {tx.balance_after} cr</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
