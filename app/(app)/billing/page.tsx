// nexire-app — app/(app)/billing/page.tsx
// Billing page — plan matrix, credit balance, top-up packs.

import { Suspense } from "react";
import { BillingClient } from "./BillingClient";

export const metadata = { title: "Billing & Credits — Nexire" };

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--muted)]">Loading billing...</div>}>
      <BillingClient />
    </Suspense>
  );
}
