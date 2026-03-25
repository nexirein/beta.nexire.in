import type { Metadata } from "next";
import { SearchClient } from "./SearchClient";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
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
  let projectId = searchParams.project_id ?? searchParams.project ?? undefined;
  const searchId = searchParams.search_id ?? undefined;

  // ── Auto-resolve Project (using Admin to ensure reliability during landing) ──
  if (!projectId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return redirect("/login");

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profile?.org_id) {
      const { data: projects } = await admin
        .from("projects")
        .select("id")
        .eq("org_id", profile.org_id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (projects && projects.length > 0) {
        projectId = projects[0].id;
        // Proceed with resolved projectId — we will redirect at the very end to clean up the URL
      }
    }

    if (!projectId) return redirect("/projects");
  }

  // ── Auto-resolve Search ID ────────────────────────────────────────────────
  let finalSearchId = searchId;
  if (projectId && !searchId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Check for existing IDLE search
      const { data: existingIdle } = await supabase
        .from("search_conversations")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .eq("status", "IDLE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingIdle) {
        finalSearchId = existingIdle.id;
      } else {
        // Create new search
        const { data: newSearch } = await supabase
          .from("search_conversations")
          .insert({
            user_id: user.id,
            project_id: projectId,
            title: "New Search",
            status: "IDLE",
            messages: [],
            accumulated_context: {},
          })
          .select("id")
          .single();
        if (newSearch) finalSearchId = newSearch.id;
      }
    }
  }

  // Final Redirect to clean up URL if we resolved anything
  if (projectId !== searchParams.project_id || finalSearchId !== searchParams.search_id) {
    return redirect(`/search?project_id=${projectId}&search_id=${finalSearchId}`);
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
