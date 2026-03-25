<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/settings.md        ← this module's API contract
-->

# M11 — TASK 02: MAILBOX CONNECT
# Trae: Read CLAUDE.md first. Read lib/config/plans.ts for mailbox limits.
# Recruiters connect their Gmail or SMTP mailboxes here so sequences
# can send from their real address — not a generic Nexire address.
# Solo: 1 mailbox. Growth: 2 mailboxes. Custom: 4+.
# Route: /settings/mailboxes
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. mailboxes table (org-scoped, per-user)
2. MailboxesPage at /settings/mailboxes
3. Gmail OAuth connect (via Google OAuth2)
4. SMTP manual connect with test-send verification
5. GET /api/settings/mailboxes — list connected mailboxes
6. POST /api/settings/mailboxes — connect new mailbox
7. DELETE /api/settings/mailboxes/[id] — disconnect
8. POST /api/settings/mailboxes/[id]/test — send test email
9. Warmup status badge (manual — no auto-warmup tool integrated)

---

## FILE 1 — Supabase SQL: mailboxes table

```sql
CREATE TABLE mailboxes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider      TEXT NOT NULL CHECK (provider IN ('gmail','outlook','smtp')),
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,           -- "Bipul Sikder @ Nexire"
  status        TEXT DEFAULT 'active'
                CHECK (status IN ('active','error','disconnected')),
  is_default    BOOLEAN DEFAULT false,   -- default mailbox for sequences

  -- OAuth providers (Gmail / Outlook)
  access_token  TEXT,                    -- encrypted at rest via Supabase Vault
  refresh_token TEXT,                    -- encrypted
  token_expiry  TIMESTAMPTZ,

  -- SMTP
  smtp_host     TEXT,
  smtp_port     INTEGER,
  smtp_user     TEXT,
  smtp_pass     TEXT,                    -- encrypted

  -- Stats
  emails_sent_today    INTEGER DEFAULT 0,
  emails_sent_total    INTEGER DEFAULT 0,
  daily_send_limit     INTEGER DEFAULT 100,   -- per mailbox (warmup-safe)
  warmup_enabled       BOOLEAN DEFAULT false,
  last_synced_at       TIMESTAMPTZ,
  last_error           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mailbox_org_email ON mailboxes(org_id, email);
CREATE INDEX idx_mailbox_user ON mailboxes(user_id);

ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User manages own mailboxes"
  ON mailboxes
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

## FILE 2 — app/(app)/settings/mailboxes/page.tsx

```tsx
import { SettingsShell } from "@/components/settings/SettingsShell";
import { MailboxesClient } from "./MailboxesClient";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mailboxes | Nexire" };

export default async function MailboxesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user?.id)
    .single();

  const { data: org } = await supabase
    .from("orgs")
    .select("plan")
    .eq("id", profile?.org_id)
    .single();

  return (
    <SettingsShell>
      <MailboxesClient plan={org?.plan ?? "free"} />
    </SettingsShell>
  );
}
```

---

## FILE 3 — app/(app)/settings/mailboxes/MailboxesClient.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import {
  Mail, Plus, Trash2, CheckCircle, AlertCircle, Wifi,
  WifiOff, Send, ExternalLink, Zap, Lock, Info
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/config/plans";
import { ConnectMailboxModal } from "./ConnectMailboxModal";

const PROVIDER_INFO = {
  gmail:   { label: "Gmail",   color: "text-red-400",    bg: "bg-red-400/10",   border: "border-red-400/20"   },
  outlook: { label: "Outlook", color: "text-blue-400",   bg: "bg-blue-400/10",  border: "border-blue-400/20"  },
  smtp:    { label: "SMTP",    color: "text-purple-400", bg: "bg-purple-400/10",border: "border-purple-400/20" },
};

const STATUS_BADGE = {
  active:       "text-green-400 bg-green-400/10 border-green-400/20",
  error:        "text-red-400 bg-red-400/10 border-red-400/20",
  disconnected: "text-[#555555] bg-[#1A1A1A] border-[#222222]",
};

interface Props { plan: string; }

export function MailboxesClient({ plan }: Props) {
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testing, setTesting]     = useState<string | null>(null);

  const planConfig  = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const maxMailboxes = planConfig.mailboxes;   // 0=free, 1=solo, 2=growth, 4=custom
  const atLimit      = maxMailboxes > 0 && mailboxes.length >= maxMailboxes;

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/settings/mailboxes");
    const data = await res.json();
    setMailboxes(data.mailboxes ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const disconnect = async (id: string, email: string) => {
    if (!confirm(`Disconnect ${email}? Active sequences using this mailbox will be paused.`)) return;
    await fetch(`/api/settings/mailboxes/${id}`, { method: "DELETE" });
    toast.success("Mailbox disconnected");
    load();
  };

  const sendTest = async (id: string) => {
    setTesting(id);
    const res = await fetch(`/api/settings/mailboxes/${id}/test`, { method: "POST" });
    setTesting(null);
    if (res.ok) toast.success("Test email sent! Check your inbox.");
    else toast.error("Test failed — check your mailbox credentials");
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/settings/mailboxes/${id}/set-default`, { method: "POST" });
    toast.success("Default mailbox updated");
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">Mailboxes</h1>
          <p className="text-xs text-[#555555] mt-0.5">
            {mailboxes.length} of {maxMailboxes === 0 ? "0 (upgrade required)" : maxMailboxes === -1 ? "∞" : maxMailboxes} connected
          </p>
        </div>
        <button
          onClick={() => atLimit ? null : setShowModal(true)}
          disabled={atLimit || maxMailboxes === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
            atLimit || maxMailboxes === 0
              ? "border-[#222222] text-[#333333] cursor-not-allowed"
              : "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white border-transparent hover:from-[#0EA5E9] hover:to-[#0284C7]"
          )}
        >
          <Plus className="w-4 h-4" />
          Connect mailbox
        </button>
      </div>

      {/* Plan limit banner */}
      {maxMailboxes === 0 && (
        <div className="flex items-start gap-3 bg-[#111111] border border-[#222222] rounded-2xl px-4 py-3.5">
          <Lock className="w-4 h-4 text-[#555555] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-[#A0A0A0]">Mailboxes require Solo or higher</p>
            <p className="text-[11px] text-[#555555] mt-0.5">Connect your Gmail or SMTP inbox to send sequences from your real address.</p>
            <a href="/settings/billing" className="text-[11px] text-[#38BDF8] mt-1.5 inline-block hover:underline">
              Upgrade to Solo →
            </a>
          </div>
        </div>
      )}

      {atLimit && maxMailboxes > 0 && (
        <div className="flex items-start gap-3 bg-yellow-400/5 border border-yellow-400/20 rounded-2xl px-4 py-3.5">
          <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-yellow-400">Mailbox limit reached ({maxMailboxes}/{maxMailboxes})</p>
            <p className="text-[11px] text-[#555555] mt-0.5">
              {plan === "solo"   && "Upgrade to Growth for 2 mailboxes."}
              {plan === "growth" && "Upgrade to Custom for 4+ mailboxes or disconnect an existing one."}
            </p>
            {plan !== "custom" && (
              <a href="/settings/billing" className="text-[11px] text-[#38BDF8] mt-1.5 inline-block hover:underline">
                Upgrade plan →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Warmup info */}
      <div className="flex items-start gap-3 bg-[#111111] border border-[#1A1A1A] rounded-2xl px-4 py-3.5">
        <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#555555] leading-relaxed">
          <span className="text-[#A0A0A0] font-medium">Daily send limit: 100 emails/mailbox.</span>{" "}
          New mailboxes should be warmed up manually — start with 20–30 emails/day and increase by 10 each week.
          Nexire enforces the 100/day limit to protect your deliverability.
        </p>
      </div>

      {/* Mailbox list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 bg-[#111111] border border-[#1A1A1A] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : mailboxes.length === 0 && maxMailboxes !== 0 ? (
        <div className="bg-[#111111] border border-dashed border-[#222222] rounded-2xl p-10 text-center">
          <Mail className="w-8 h-8 text-[#222222] mx-auto mb-2" />
          <p className="text-sm text-[#555555]">No mailboxes connected</p>
          <p className="text-xs text-[#333333] mt-1">Connect Gmail or SMTP to start sending sequences from your real email</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mailboxes.map(mb => {
            const pInfo = PROVIDER_INFO[mb.provider as keyof typeof PROVIDER_INFO] ?? PROVIDER_INFO.smtp;
            const sColor = STATUS_BADGE[mb.status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.disconnected;
            const sentPct = Math.min(100, Math.round((mb.emails_sent_today / mb.daily_send_limit) * 100));

            return (
              <div key={mb.id} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border", pInfo.bg, pInfo.border)}>
                      <Mail className={cn("w-4 h-4", pInfo.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#FAFAFA]">{mb.email}</p>
                        {mb.is_default && (
                          <span className="text-[9px] text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/20 px-1.5 py-0.5 rounded-md font-medium">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md border font-medium capitalize", pInfo.color, pInfo.bg, pInfo.border)}>
                          {pInfo.label}
                        </span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md border font-medium capitalize", sColor)}>
                          {mb.status}
                        </span>
                        {mb.display_name && (
                          <span className="text-[10px] text-[#333333]">{mb.display_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!mb.is_default && (
                      <button
                        onClick={() => setDefault(mb.id)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all font-medium"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      onClick={() => sendTest(mb.id)}
                      disabled={testing === mb.id}
                      className="p-1.5 rounded-lg text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all"
                      title="Send test email"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => disconnect(mb.id, mb.email)}
                      className="p-1.5 rounded-lg text-[#555555] hover:text-red-400 hover:bg-red-400/10 transition-all"
                      title="Disconnect mailbox"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Daily send progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-[#333333]">Today's sends</p>
                    <p className="text-[10px] text-[#555555]">{mb.emails_sent_today} / {mb.daily_send_limit}</p>
                  </div>
                  <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", sentPct > 80 ? "bg-red-400" : sentPct > 50 ? "bg-yellow-400" : "bg-[#38BDF8]")}
                      style={{ width: `${sentPct}%` }}
                    />
                  </div>
                </div>

                {mb.last_error && (
                  <div className="mt-3 flex items-center gap-2 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <p className="text-[11px] text-red-400">{mb.last_error}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ConnectMailboxModal
          onClose={() => setShowModal(false)}
          onConnected={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
```

---

## FILE 4 — app/(app)/settings/mailboxes/ConnectMailboxModal.tsx

```tsx
"use client";
import { useState } from "react";
import { X, Mail, ExternalLink, AlertTriangle, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Provider = "gmail" | "smtp";

interface Props { onClose: () => void; onConnected: () => void; }

export function ConnectMailboxModal({ onClose, onConnected }: Props) {
  const [provider, setProvider] = useState<Provider>("gmail");
  const [smtpForm, setSmtpForm] = useState({
    email: "", display_name: "", smtp_host: "",
    smtp_port: "587", smtp_user: "", smtp_pass: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState<"choose" | "gmail_pending" | "smtp_form">("choose");

  const connectGmail = async () => {
    setStep("gmail_pending");
    // Redirect to Google OAuth
    const res  = await fetch("/api/settings/mailboxes/gmail-auth-url");
    const data = await res.json();
    window.location.href = data.url;
  };

  const connectSMTP = async () => {
    if (!smtpForm.email || !smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_pass) {
      toast.error("Fill all required fields");
      return;
    }
    setConnecting(true);
    const res = await fetch("/api/settings/mailboxes", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ provider: "smtp", ...smtpForm, smtp_port: Number(smtpForm.smtp_port) }),
    });
    setConnecting(false);
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "Connection failed — check your SMTP credentials");
      return;
    }
    toast.success("Mailbox connected!");
    onConnected();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-md bg-[#111111] border border-[#1A1A1A] rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#1A1A1A]">
            <h2 className="text-sm font-bold text-[#FAFAFA]">Connect a mailbox</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Provider selector */}
            {(step === "choose" || step === "smtp_form") && (
              <div className="grid grid-cols-2 gap-2">
                {(["gmail", "smtp"] as Provider[]).map(p => (
                  <button
                    key={p}
                    onClick={() => { setProvider(p); setStep(p === "smtp" ? "smtp_form" : "choose"); }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border text-xs font-medium transition-all",
                      provider === p
                        ? "bg-[#38BDF8]/10 border-[#38BDF8]/30 text-[#38BDF8]"
                        : "bg-[#0A0A0A] border-[#222222] text-[#555555] hover:border-[#333333] hover:text-[#A0A0A0]"
                    )}
                  >
                    <Mail className="w-5 h-5" />
                    {p === "gmail" ? "Gmail / Google Workspace" : "SMTP (any provider)"}
                  </button>
                ))}
              </div>
            )}

            {/* Gmail flow */}
            {step === "choose" && provider === "gmail" && (
              <div className="space-y-3">
                <div className="bg-[#0A0A0A] border border-[#222222] rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-medium text-[#A0A0A0]">What Nexire accesses:</p>
                  {["Send emails on your behalf (sequences only)", "Read send status (no inbox reading)", "Refresh token stored encrypted"].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                      <p className="text-[11px] text-[#555555]">{item}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={connectGmail}
                  disabled={step === "gmail_pending" as any}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> Connect with Google
                </button>
              </div>
            )}

            {/* SMTP form */}
            {step === "smtp_form" && (
              <div className="space-y-3">
                {[
                  { key: "email",        label: "From email",    placeholder: "you@company.com",   type: "email"    },
                  { key: "display_name", label: "Display name",  placeholder: "Bipul @ Nexire",    type: "text"     },
                  { key: "smtp_host",    label: "SMTP host",     placeholder: "smtp.gmail.com",    type: "text"     },
                  { key: "smtp_port",    label: "SMTP port",     placeholder: "587",               type: "number"   },
                  { key: "smtp_user",    label: "SMTP username", placeholder: "you@company.com",   type: "email"    },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1">
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      value={smtpForm[f.key as keyof typeof smtpForm]}
                      onChange={e => setSmtpForm(s => ({ ...s, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1">
                    SMTP password / app password
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={smtpForm.smtp_pass}
                      onChange={e => setSmtpForm(s => ({ ...s, smtp_pass: e.target.value }))}
                      placeholder="App password (not your Google login)"
                      className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 pr-10 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                    />
                    <button onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#333333]">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-[#333333] mt-1">For Gmail: use a 16-char App Password from Google Account → Security → 2FA → App Passwords</p>
                </div>

                <button
                  onClick={connectSMTP}
                  disabled={connecting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {connecting ? "Testing connection..." : "Connect mailbox"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

---

## FILE 5 — app/api/settings/mailboxes/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/config/plans";
import nodemailer from "nodemailer";
import { encrypt, decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: mailboxes } = await supabase
    .from("mailboxes")
    .select("id, provider, email, display_name, status, is_default, emails_sent_today, daily_send_limit, emails_sent_total, last_error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ mailboxes: mailboxes ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: org } = await supabase
    .from("orgs").select("plan").eq("id", profile?.org_id).single();

  // Check plan limit
  const plan      = PLANS[org?.plan as keyof typeof PLANS] ?? PLANS.free;
  const { count } = await supabase
    .from("mailboxes").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  if (plan.mailboxes !== -1 && (count ?? 0) >= plan.mailboxes) {
    return NextResponse.json({ error: `Your plan allows ${plan.mailboxes} mailbox(es). Upgrade to add more.` }, { status: 403 });
  }

  const body = await req.json();

  if (body.provider === "smtp") {
    // Test SMTP connection
    try {
      const transporter = nodemailer.createTransport({
        host: body.smtp_host, port: Number(body.smtp_port),
        secure: Number(body.smtp_port) === 465,
        auth: { user: body.smtp_user, pass: body.smtp_pass },
      });
      await transporter.verify();
    } catch (e: any) {
      return NextResponse.json({ error: `SMTP connection failed: ${e.message}` }, { status: 400 });
    }

    const { data: mb, error: insertError } = await supabase
      .from("mailboxes")
      .insert({
        org_id:       profile?.org_id,
        user_id:      user.id,
        provider:     "smtp",
        email:        body.email.toLowerCase().trim(),
        display_name: body.display_name,
        smtp_host:    body.smtp_host,
        smtp_port:    Number(body.smtp_port),
        smtp_user:    body.smtp_user,
        smtp_pass:    encrypt(body.smtp_pass),
        status:       "active",
        is_default:   count === 0,   // first mailbox = default
      })
      .select("id").single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json(mb, { status: 201 });
  }

  return NextResponse.json({ error: "Use /mailboxes/gmail-auth-url for Gmail" }, { status: 400 });
}
```

---

## FILE 6 — app/api/settings/mailboxes/[id]/route.ts  (DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("mailboxes")
    .update({ status: "disconnected" })
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 7 — app/api/settings/mailboxes/[id]/test/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/crypto";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: mb } = await supabase
    .from("mailboxes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!mb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles").select("full_name").eq("id", user.id).single();

  try {
    const transporter = nodemailer.createTransport({
      host: mb.smtp_host, port: mb.smtp_port,
      secure: mb.smtp_port === 465,
      auth: { user: mb.smtp_user, pass: decrypt(mb.smtp_pass) },
    });

    await transporter.sendMail({
      from:    `"${mb.display_name}" <${mb.email}>`,
      to:      mb.email,
      subject: "✅ Nexire mailbox test — connection successful",
      html: `<p>Hi ${profile?.full_name ?? "there"},</p><p>Your mailbox <strong>${mb.email}</strong> is successfully connected to Nexire. Sequences will send from this address.</p><p>— The Nexire team</p>`,
    });

    await supabase.from("mailboxes")
      .update({ status: "active", last_error: null })
      .eq("id", params.id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    await supabase.from("mailboxes")
      .update({ status: "error", last_error: e.message })
      .eq("id", params.id);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

---

## FILE 8 — lib/crypto.ts  (encrypt/decrypt for stored credentials)

```typescript
// lib/crypto.ts — symmetric encryption for SMTP passwords
// Uses AES-256-GCM. Key stored in ENCRYPTION_SECRET env var (32 chars).
import crypto from "crypto";

const ALG  = "aes-256-gcm";
const KEY  = Buffer.from(process.env.ENCRYPTION_SECRET!.padEnd(32).slice(0, 32));

export function encrypt(text: string): string {
  const iv         = crypto.randomBytes(16);
  const cipher     = crypto.createCipheriv(ALG, KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag        = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALG, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
}
```

---

## ENV VARS TO ADD
```bash
# .env.local
ENCRYPTION_SECRET=your-32-char-secret-key-here-pad  # exactly 32 chars
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/settings/mailboxes/gmail-callback
```

## INSTALL DEPENDENCIES
```bash
npm install nodemailer @types/nodemailer
```

---

## COMPLETION CHECKLIST
- [ ] mailboxes table: provider (gmail/smtp), credentials encrypted, is_default, daily_send_limit
- [ ] lib/crypto.ts: AES-256-GCM encrypt/decrypt for SMTP passwords
- [ ] MailboxesClient: plan-aware (shows upgrade CTA if at limit or Free)
- [ ] ConnectMailboxModal: Gmail tab (redirect OAuth) + SMTP tab (form with test)
- [ ] SMTP connect: nodemailer verify() before insert — rejects bad credentials
- [ ] Test email: sends to own address, updates status = active or error
- [ ] Daily send progress bar: changes colour (blue → yellow → red) as limit approached
- [ ] Set default: POST /api/settings/mailboxes/[id]/set-default
- [ ] Disconnect: sets status = disconnected (soft delete)
- [ ] Plan limits enforced: Free = 0, Solo = 1, Growth = 2, Custom = 4
- [ ] ENCRYPTION_SECRET env var documented
- [ ] nodemailer installed

## BUILD LOG ENTRY
## M11-02 Mailbox Connect — [date]
### Files: mailboxes SQL, MailboxesClient, ConnectMailboxModal, 4 API routes, lib/crypto.ts
### Status: ✅ Complete
