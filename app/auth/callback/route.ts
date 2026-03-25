/**
 * app/auth/callback/route.ts
 * OAuth + Magic Link callback handler.
 * - Exchanges auth code for session
 * - Ensures profile + org exist (fallback creation if trigger missed)
 * - Syncs full_name + avatar_url from Google metadata
 * - Redirects to first project's search or onboarding
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? null;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options) { cookieStore.set({ name, value: "", ...options }); },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Extract real name + avatar from Google/OAuth metadata
  const googleName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.user_metadata?.preferred_username ??
    user.email?.split("@")[0] ??
    "User";

  const googleAvatar =
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    null;

  // Get profile — should exist from handle_new_user trigger
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, avatar_url, job_title, org_id")
    .eq("id", user.id)
    .single();

  let orgId: string;
  let isNewUser = false;

  if (!profile) {
    // Trigger may have failed — create org + profile manually
    isNewUser = true;
    const { data: newOrg } = await admin
      .from("orgs")
      .insert({ name: "My Organisation", plan: "free", credits_balance: 50 })
      .select("id")
      .single();

    if (!newOrg) {
      return NextResponse.redirect(`${origin}/login?error=profile_creation_failed`);
    }

    orgId = newOrg.id;
    await admin.from("profiles").insert({
      id: user.id,
      org_id: orgId,
      member_role: "owner",
      full_name: googleName,
      avatar_url: googleAvatar,
    });
  } else {
    orgId = profile.org_id;

    // Always sync name + avatar from OAuth provider to keep profile fresh
    const needsUpdate =
      (!profile.full_name || profile.full_name === "User") ||
      profile.avatar_url !== googleAvatar;

    if (needsUpdate) {
      await admin
        .from("profiles")
        .update({
          full_name:
            profile.full_name && profile.full_name !== "User"
              ? profile.full_name
              : googleName,
          avatar_url: googleAvatar ?? profile.avatar_url,
        })
        .eq("id", user.id);
    }

    // No job_title = first-time profile setup
    if (!profile.job_title) {
      isNewUser = true;
    }
  }

  // If caller specified a redirect target, use it
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (isNewUser) {
    // New user: go to onboarding (or straight to projects if no onboarding page)
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  // Returning user: jump to their first active project search
  const { data: projects } = await admin
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (projects && projects.length > 0) {
    return NextResponse.redirect(`${origin}/search?project_id=${projects[0].id}`);
  }

  return NextResponse.redirect(`${origin}/projects`);
}
