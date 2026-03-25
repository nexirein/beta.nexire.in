import type { Metadata } from "next";
import { SearchClient } from "./SearchClient";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Search — Nexire",
  description: "Search and discover top talent with AI-powered scoring.",
};

// Server component: reads URL params and passes initial project/search context to SearchClient
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { project_id?: string; search_id?: string; project?: string };
}) {
  const projectId = searchParams.project_id ?? searchParams.project ?? undefined;
  const searchId = searchParams.search_id ?? undefined;

  // Fetch project title server-side for breadcrumb
  let projectTitle: string | undefined;
  if (projectId) {
    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from("projects")
        .select("title")
        .eq("id", projectId)
        .single();
      projectTitle = data?.title ?? undefined;
    } catch {
      // Non-critical — breadcrumb just won't show project name
    }
  }

  return (
    <SearchClient
      initialProjectId={projectId}
      initialProjectTitle={projectTitle}
      initialSearchId={searchId}
    />
  );
}
