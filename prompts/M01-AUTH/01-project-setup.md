<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/auth.md            ← this module's API contract
-->

M01 — TASK 01: PROJECT SETUP + GLOBAL CONFIG
Trae: Read CLAUDE.md first. Execute everything in this file completely before stopping.
After completion, append summary to _meta/BUILD-LOG.md
OBJECTIVE
Bootstrap the nexire-app Next.js project with full configuration:
design system, fonts, global styles, layout shell, env setup, and all base packages.

STEP 1 — INSTALL PACKAGES
Run these exact commands:

bash
npx create-next-app@latest nexire-app --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
cd nexire-app
npm install @supabase/supabase-js @supabase/ssr
npm install @upstash/redis @upstash/ratelimit
npm install razorpay
npm install resend
npm install zod
npm install geist
npm install framer-motion
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip
npm install @radix-ui/react-progress @radix-ui/react-separator @radix-ui/react-avatar
npm install @radix-ui/react-select @radix-ui/react-slider @radix-ui/react-switch
npm install lucide-react
npm install class-variance-authority clsx tailwind-merge
npm install cmdk
npm install sonner
npm install posthog-js
npm install @sentry/nextjs
npm install -D @types/node
STEP 2 — tailwind.config.ts
Create/replace tailwind.config.ts with EXACTLY this content:

typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // App interior (dark)
        background: "#0A0A0A",
        surface: "#111111",
        "surface-hover": "#1A1A1A",
        border: "#222222",
        "border-subtle": "#1A1A1A",
        "text-primary": "#FAFAFA",
        "text-secondary": "#A0A0A0",
        "text-muted": "#555555",
        accent: "#38BDF8",
        "accent-dark": "#0EA5E9",
        // Status
        success: "#22C55E",
        warning: "#EAB308",
        error: "#EF4444",
        // Auth pages (light gradient)
        "auth-from": "#EFF6FF",
        "auth-via": "#BAE6FD",
        "auth-to": "#FFFFFF",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        "glow-blue": "0 0 40px rgba(56, 189, 248, 0.12)",
        "glow-blue-sm": "0 0 20px rgba(56, 189, 248, 0.08)",
        "card": "0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)",
      },
      backgroundImage: {
        "auth-gradient": "linear-gradient(160deg, #EFF6FF 0%, #BAE6FD 45%, #FFFFFF 100%)",
        "accent-gradient": "linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%)",
        "card-gradient": "linear-gradient(135deg, #111111 0%, #0A0A0A 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        slideDown: { from: { transform: "translateY(-8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(56,189,248,0.1)" },
          "50%": { boxShadow: "0 0 40px rgba(56,189,248,0.25)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
STEP 3 — app/layout.tsx (Root Layout)
typescript
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Nexire — AI Recruitment for India",
  description: "Find the right candidate. Tonight.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-text-primary font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#111111",
              border: "1px solid #222222",
              color: "#FAFAFA",
            },
          }}
        />
      </body>
    </html>
  );
}
STEP 4 — app/globals.css
css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    box-sizing: border-box;
    border-color: #222222;
  }

  body {
    background-color: #0A0A0A;
    color: #FAFAFA;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #0A0A0A; }
  ::-webkit-scrollbar-thumb { background: #333333; border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: #38BDF8; }

  /* Focus ring */
  *:focus-visible {
    outline: 2px solid #38BDF8;
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* Selection */
  ::selection { background: rgba(56, 189, 248, 0.2); }
}

@layer utilities {
  .gradient-text {
    background: linear-gradient(135deg, #38BDF8, #0EA5E9);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .glass-card {
    background: rgba(17, 17, 17, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(56, 189, 248, 0.1);
  }

  .auth-page {
    background: linear-gradient(160deg, #EFF6FF 0%, #BAE6FD 45%, #FFFFFF 100%);
    min-height: 100vh;
  }
}
STEP 5 — .env.example (create this file)
text
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Prospeo
PROSPEO_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@nexire.in

# App
NEXT_PUBLIC_APP_URL=https://app.nexire.in

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
SENTRY_DSN=

# Cron
CRON_SECRET=
STEP 6 — Create folder structure (empty files with comments)
Create these empty files now so Trae agents can reference them later:

text
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/middleware.ts
lib/supabase/queries/users.ts
lib/supabase/queries/projects.ts
lib/supabase/queries/candidates.ts
lib/supabase/queries/reveals.ts
lib/supabase/queries/shortlist.ts
lib/supabase/queries/sequences.ts
lib/supabase/queries/billing.ts
lib/credits/engine.ts
lib/redis/client.ts
lib/redis/rate-limiter.ts
lib/redis/search-cache.ts
lib/prospeo/client.ts
lib/prospeo/filters.ts
lib/prospeo/types.ts
lib/razorpay/client.ts
lib/razorpay/webhook-validator.ts
lib/resend/client.ts
lib/ai/search-parser.ts
lib/ai/scorer.ts
lib/ai/notice-estimator.ts
lib/whatsapp/link-generator.ts
lib/utils/format.ts
lib/utils/validators.ts
lib/utils/constants.ts
types/database.ts
types/prospeo.ts
types/billing.ts
types/search.ts
Each empty file should have a top comment:

typescript
// nexire-app — [filename]
// Part of Nexire AI Recruitment Platform
// See CLAUDE.md for architecture rules
STEP 7 — lib/utils/constants.ts
typescript
// nexire-app — lib/utils/constants.ts
export const PLAN_LIMITS = {
  free:   { credits: 15,  results: 10,    roles: 1, sequences: 1 },
  solo:   { credits: 200, results: 1500,  roles: 5, sequences: 5 },
  growth: { credits: 600, results: -1,    roles: -1, sequences: -1 },
  custom: { credits: -1,  results: -1,    roles: -1, sequences: -1 },
} as const;

export const CREDIT_COSTS = {
  EMAIL_REVEAL: 1,
  PHONE_REVEAL: 8,   // Nexire charges 8, pays Prospeo 10
} as const;

export const PROSPEO_COSTS_INR = {
  EMAIL:  1.85,
  PHONE: 18.50,
} as const;

export const CREDIT_TOPUP_PACKS = [
  { credits: 50,  price_inr: 999,  price_paise: 99900 },
  { credits: 100, price_inr: 1799, price_paise: 179900 },
  { credits: 200, price_inr: 2999, price_paise: 299900 },
] as const;

export const RATE_LIMITS = {
  SEARCH_PER_HOUR:  80,
  SEARCH_PER_DAY:   400,
  REVEAL_PER_HOUR:  50,
  REVEAL_PER_DAY:   100,
} as const;

export const REDIS_TTL = {
  SEARCH_CACHE_SECONDS: 86400,  // 24 hours
  RATE_LIMIT_WINDOW:    3600,   // 1 hour
} as const;

export type PlanTier = "free" | "solo" | "growth" | "custom";
export type RevealType = "email" | "phone_email";
export type MatchLabel = "good" | "potential" | "no_match";
STEP 8 — next.config.ts
typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "media.licdn.com" },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ["app.nexire.in", "localhost:3000"] },
  },
};

export default nextConfig;
STEP 9 — vercel.json (for cron jobs)
json
{
  "crons": [
    {
      "path": "/api/sequences-cron",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/credits-cron",
      "schedule": "0 0 1 * *"
    }
  ]
}
COMPLETION CHECKLIST
 All packages installed without errors

 tailwind.config.ts has all color tokens

 globals.css has auth-page gradient utility

 Root layout uses Geist font

 .env.example committed (not .env.local)

 All lib/ folder structure created

 constants.ts has all plan limits + credit costs

 next.config.ts and vercel.json created

BUILD LOG ENTRY
Append to _meta/BUILD-LOG.md:

M01-01 Project Setup — [today's date]
Files Created
tailwind.config.ts, app/layout.tsx, app/globals.css

.env.example, next.config.ts, vercel.json

lib/ folder structure (all empty files)

lib/utils/constants.ts

Status: ✅ Complete