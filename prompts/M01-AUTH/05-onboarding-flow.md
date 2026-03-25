<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/auth.md            ← this module's API contract
-->

M01 — TASK 05: ONBOARDING FLOW
Trae: Read CLAUDE.md first. Builds 2-step onboarding wizard after first login.
Gradient background continues from auth pages. After completion: append to BUILD-LOG.md
OBJECTIVE
2-step onboarding: Step 1 = Plan Selection (4 plan cards), Step 2 = Profile Setup (name/phone/company)
Free plan → /projects | Paid plan → /billing?plan=solo&onboarding=true

DESIGN
Same auth-gradient background

Progress bar: 2 segments, fills left-to-right as steps complete

Step 1 card: max-w-3xl, 2x2 plan grid

Step 2 card: max-w-sm, profile form

Selected plan: border-[#38BDF8] + shadow-glow-blue-sm

All inputs: same style as login page (bg-white, border-gray-200, focus:border-[#38BDF8])

FILE 1 — app/(auth)/onboarding/page.tsx
Build a client component that:

Holds state: step (1|2) and selectedPlan ("free"|"solo"|"growth"|"custom")

Renders PlanSelectionStep when step=1

Renders ProfileSetupStep when step=2

Shows nexire logo at top + progress bar (2 segments)

FILE 2 — app/(auth)/onboarding/PlanSelectionStep.tsx
4 plan cards in a 2x2 grid:

Plan	Price	Credits	Highlights
Free	₹0	15/mo	15 credits, 10 results, 1 role, 1 seq
Solo	₹3,999/mo	200/mo	200 credits, 1500 results, 5 roles
Growth	₹7,999/mo	600/mo	600 credits, unlimited results, 3 seats
Custom	₹24,999+	custom	Everything unlimited, priority support
Selected card: border-[#38BDF8] shadow-glow-blue-sm checkmark top-right
Most popular badge: on Solo card (gradient pill -top-2.5)
CTA button: "Continue with [Plan Name] →" full width gradient

FILE 3 — app/(auth)/onboarding/ProfileSetupStep.tsx
Form fields:

Full name* (required)

Company / Agency name

Your role (placeholder: "Technical Recruiter")

Phone: prefix +91 in gray left box, number input right

On submit:

Validate full_name not empty

Call PATCH /api/auth/profile with { full_name, phone, onboarding_done: true }

Free plan: toast success → router.push("/projects")

Paid plan: window.location = /billing?plan=[plan]&onboarding=true

Show selected plan badge inside form (blue bg-blue-50 pill)

Back button top-left → setStep(1)

FILE 4 — app/api/auth/profile/route.ts
PATCH endpoint:

Auth check (Supabase JWT)

Zod validate: { full_name: string, phone?: string, onboarding_done?: boolean }

Update profiles table

Return { success: true }

GET endpoint:

Auth check

Return profile: id, full_name, email, phone, plan_tier, credits_balance, onboarding_done

COMPLETION CHECKLIST
 2-step wizard with progress bar works

 Plan cards selectable, correct pricing shown

 Profile form submits and redirects correctly

 API route validates with Zod, returns 401 if not auth'd

BUILD LOG ENTRY
Append to _meta/BUILD-LOG.md:

M01-05 Onboarding — [date]
Files: onboarding/page.tsx, PlanSelectionStep.tsx, ProfileSetupStep.tsx, api/auth/profile/route.ts
Status: ✅ Complete