// nexire-app — app/(app)/contacts/page.tsx
// Contacts master list page.

import { Suspense } from "react";
import { ContactsClient } from "./ContactsClient";

export const metadata = { title: "Contacts — Nexire" };

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--muted)]">Loading contacts...</div>}>
      <ContactsClient />
    </Suspense>
  );
}
