import type { Metadata } from "next";
import { SearchClient } from "./SearchClient";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Search — Nexire",
  description: "Search and discover top talent with AI-powered scoring.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { project_id?: string; search_id?: string; project?: string };
}) {
  const supabase = createServerClient();
  const projectId = searchParams.project_id ?? searchParams.project ?? undefined;
  const searchId = searchParams.search_id ?? undefined;

  // ── Auto-resolve Project ──────────────────────────────────────────────────
  if (!projectId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return redirect("/login");

    // Get user's profile to find their org
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profile?.org_id) {
      // Find the most recently updated project in this org
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("org_id", profile.org_id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (projects && projects.length > 0) {
        return redirect(`/search?project_id=${projects[0].id}`);
      }
    }

    // No projects yet? Go to projects list to create one
    return redirect("/projects");
  }

  // ── Fetch project title for breadcrumb ────────────────────────────────────
  let projectTitle: string | undefined;
  try {
    const { data } = await supabase
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .single();
    projectTitle = data?.title ?? undefined;
  } catch {
    // Non-critical
  }

  return (
    <SearchClient
      initialProjectId={projectId}
      initialProjectTitle={projectTitle}
      initialSearchId={searchId}
    />
  );
}
