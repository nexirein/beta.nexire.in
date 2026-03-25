// nexire-app — app/(app)/sequences/page.tsx
// Sequences list page

import { Suspense } from "react";
import { SequencesClient } from "./SequencesClient";

export const metadata = { title: "Sequences — Nexire" };

export default function SequencesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--muted)]">Loading sequences...</div>}>
      <SequencesClient />
    </Suspense>
  );
}
