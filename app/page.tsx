/**
 * app/page.tsx
 * Root route redirect.
 * Middleware handles auth → this component is a fallback for static rendering.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/search");
  } else {
    redirect("/login");
  }
}
