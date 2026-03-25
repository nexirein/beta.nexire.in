"use server";

/**
 * app/(auth)/onboarding/actions.ts
 * Server action for onboarding — uses service role (admin) client
 * to bypass RLS issues with freshly created profiles.
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() { },
        remove() { },
      },
    }
  );
}

export async function completeOnboarding(orgName: string, jobTitle: string) {
  // 1. Get the current authenticated user
  const authClient = getAuthClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in again." };
  }

  // 2. Use admin client to bypass RLS
  const admin = getAdminClient();

  // 3. Read the profile (admin bypasses RLS)
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  let orgId: string;

  if (profileErr || !profile) {
    // If trigger didn't fire, create org + profile manually
    const { data: newOrg, error: orgCreateErr } = await admin
      .from("orgs")
      .insert({
        name: orgName.trim(),
        plan: "free",
        credits_balance: 50,
        credits_monthly: 50,
        cycle_resets_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .select()
      .single();

    if (orgCreateErr || !newOrg) {
      return { error: `Failed to create organisation: ${orgCreateErr?.message}` };
    }

    const { error: profileCreateErr } = await admin.from("profiles").insert({
      id: user.id,
      org_id: newOrg.id,
      member_role: "owner",
      full_name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        "User",
      avatar_url: user.user_metadata?.avatar_url ?? null,
      job_title: jobTitle.trim(),
    });

    if (profileCreateErr) {
      return { error: `Failed to create profile: ${profileCreateErr.message}` };
    }

    orgId = newOrg.id;
  } else {
    // 4. Profile exists — update org name and job title
    orgId = profile.org_id;
    const { error: orgUpdateErr } = await admin
      .from("orgs")
      .update({ name: orgName.trim() })
      .eq("id", orgId);

    if (orgUpdateErr) {
      return { error: `Failed to update org: ${orgUpdateErr.message}` };
    }

    const { error: profileUpdateErr } = await admin
      .from("profiles")
      .update({ job_title: jobTitle.trim() })
      .eq("id", user.id);

    if (profileUpdateErr) {
      return { error: `Failed to update profile: ${profileUpdateErr.message}` };
    }
  }

  // 5. Ensure "First Project" exists (or any project), then return its ID
  const { data: existingProjects } = await admin
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1);

  let projectIdToReturn: string;

  if (existingProjects && existingProjects.length > 0) {
    projectIdToReturn = existingProjects[0].id;
  } else {
    const { data: newProject, error: projectErr } = await admin
      .from("projects")
      .insert({
        org_id: orgId,
        title: "First Project",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (projectErr || !newProject) {
      return { error: "Failed to create First Project." };
    }
    projectIdToReturn = newProject.id;
  }

  return { success: true, projectId: projectIdToReturn };
}
