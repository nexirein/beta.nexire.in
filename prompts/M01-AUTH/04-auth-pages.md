<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/auth.md            ← this module's API contract
-->

M01 — TASK 04: AUTH PAGES (Login + Signup + Callback)
Trae: Read CLAUDE.md first. Build all files listed below completely.
UI Reference: Sky-blue gradient (like Cluely.com) + Nexire dark blue accent.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build the login, signup, and auth callback pages with:

Sky blue gradient background (light, premium, airy feel)

Google OAuth button

Magic link (email OTP) flow

Beautiful, minimal UI — the user's first impression of Nexire

DESIGN SPEC FOR ALL AUTH PAGES
Background: bg-auth-gradient (defined in tailwind.config.ts)
= linear-gradient(160deg, #EFF6FF 0%, #BAE6FD 45%, #FFFFFF 100%)

Card: White card, centered, max-w-sm, rounded-2xl, shadow-xl
Logo: "nexire" wordmark, text-[#0EA5E9], font-bold, text-2xl, tracking-tight
Heading: text-gray-900, font-semibold, text-2xl
Subtext: text-gray-500, text-sm
Google button: White bg, border, shadow-sm, rounded-xl, hover:bg-gray-50
Input: bg-white border-gray-200 focus:border-[#38BDF8] rounded-xl text-gray-900
Primary button: bg-accent-gradient (from-[#38BDF8] to-[#0EA5E9]), text-white, rounded-xl
All text on auth pages: gray-900 (dark) because background is light

FILE 1 — app/(auth)/layout.tsx
tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}
FILE 2 — app/(auth)/login/page.tsx
Build a complete login page with:

Logo at top center

"Welcome back" heading

"Sign in to Nexire" subtext

Google OAuth button (icon + "Continue with Google")

Divider with "or"

Email input

"Send magic link" button

Success state: shows "Check your inbox" message with email shown

Link to /signup at bottom

tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Chrome } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      toast.error("Google sign in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setMagicLinkSent(true);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in">
        {/* Nexire Logo */}
        <div className="mb-6">
          <span className="text-2xl font-bold text-[#0EA5E9] tracking-tight">nexire</span>
        </div>
        {/* Email icon with glow */}
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-[#38BDF8]" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-sm text-gray-500 mb-1">We sent a magic link to</p>
        <p className="text-sm font-medium text-[#0EA5E9] mb-6">{email}</p>
        <p className="text-xs text-gray-400">
          Click the link in the email to sign in. No password needed.
        </p>
        <button
          onClick={() => setMagicLinkSent(false)}
          className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 animate-fade-in">
      {/* Logo */}
      <div className="text-center mb-8">
        <span className="text-2xl font-bold text-[#0EA5E9] tracking-tight">nexire</span>
        <h1 className="text-xl font-semibold text-gray-900 mt-3">Welcome back</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
      </div>

      {/* Google Button */}
      <button
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm disabled:opacity-60 mb-5"
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
        )}
        Continue with Google
      </button>

      {/* Divider */}
      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-100" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-white text-gray-400">or continue with email</span>
        </div>
      </div>

      {/* Magic Link Form */}
      <form onSubmit={handleMagicLink} className="space-y-3">
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/20 transition-all"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] hover:from-[#0EA5E9] hover:to-[#0284C7] text-white font-medium rounded-xl py-3 text-sm transition-all duration-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {loading ? "Sending..." : "Send magic link"}
        </button>
      </form>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Don't have an account?{" "}
        <Link href="/signup" className="text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors">
          Sign up free
        </Link>
      </p>
    </div>
  );
}
FILE 3 — app/(auth)/signup/page.tsx
Same structure as login but:

Heading: "Start finding candidates"

Subtext: "Create your free Nexire account"

After email submit: shows "Check your inbox" same as login

Footer: "Already have an account? Sign in"

Add a small "Free forever. No credit card required." badge under the logo

Build this following the exact same pattern as login page above,
just swap the text and the link direction.

FILE 4 — app/auth/callback/route.ts
typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if onboarding is complete
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_done")
          .eq("id", user.id)
          .single();

        if (!profile?.onboarding_done) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
FILE 5 — components/ui/logo.tsx
tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function NexireLogo({ variant = "dark", size = "md", href = "/" }: LogoProps) {
  const sizeClasses = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" };
  const colorClasses = {
    dark: "text-[#0EA5E9]",
    light: "text-[#38BDF8]",
  };

  const logo = (
    <span className={cn("font-bold tracking-tight", sizeClasses[size], colorClasses[variant])}>
      nexire
    </span>
  );

  return href ? <Link href={href}>{logo}</Link> : logo;
}
FILE 6 — lib/utils.ts (cn utility)
typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
STEP — Configure Google OAuth in Supabase
Instructions (do NOT code this — these are manual steps):

Go to Supabase Dashboard → Authentication → Providers → Google

Enable Google provider

Add Google OAuth credentials from Google Cloud Console

Set Authorized redirect URI: https://[project].supabase.co/auth/v1/callback

In Google Cloud Console, also add: https://app.nexire.in/auth/callback

COMPLETION CHECKLIST
 app/(auth)/layout.tsx — gradient background layout

 app/(auth)/login/page.tsx — Google + magic link with all states

 app/(auth)/signup/page.tsx — same pattern, different copy

 app/auth/callback/route.ts — redirects to /onboarding if not done

 components/ui/logo.tsx — NexireLogo component

 lib/utils.ts — cn utility

 Visited /login in browser: shows gradient background, white card

 Google button visible and styled correctly

 Magic link form submits and shows "Check your inbox" state

BUILD LOG ENTRY
Append to _meta/BUILD-LOG.md:

M01-04 Auth Pages — [date]
Files Created
app/(auth)/layout.tsx

app/(auth)/login/page.tsx

app/(auth)/signup/page.tsx

app/auth/callback/route.ts

components/ui/logo.tsx

lib/utils.ts

Design: Sky blue gradient auth pages, white card, Nexire blue accent
Status: ✅ Complete