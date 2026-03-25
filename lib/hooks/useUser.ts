"use client";

/**
 * lib/hooks/useUser.ts
 * Client-side hook for accessing the current user's profile + org.
 * Uses the browser Supabase client. Returns null while loading.
 *
 * Usage in any client component:
 *   const { profile, org, loading } = useUser()
 *   if (loading) return <Spinner />
 *   if (!profile) redirect('/login')
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Org } from "@/types/database";

interface UserContext {
  profile: Profile | null;
  org: Org | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useUser(): UserContext {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        setOrg(null);
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*, org:orgs(*)")
        .eq("id", user.id)
        .single();

      if (data) {
        const { org: orgData, ...profileData } = data;

        // Fallback for missing/generic names
        const googleName =
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split("@")[0] ??
          "User";

        const finalProfile = {
          ...profileData,
          full_name: profileData.full_name && profileData.full_name !== "User"
            ? profileData.full_name
            : googleName,
          avatar_url: profileData.avatar_url ?? user.user_metadata?.avatar_url ?? null
        };

        setProfile(finalProfile as Profile);
        setOrg(orgData as Org);

        // Background sync if name was missing in DB
        if (!profileData.full_name || profileData.full_name === "User") {
          supabase.from("profiles")
            .update({
              full_name: googleName,
              avatar_url: finalProfile.avatar_url
            })
            .eq("id", user.id)
            .then(() => { });
        }
      } else if (profileError) {
        // Even if DB fetch fails (e.g. row missing), provide a skeleton from metadata
        const googleName =
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split("@")[0] ??
          "User";

        setProfile({
          id: user.id,
          full_name: googleName,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        } as any);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { profile, org, loading, refresh: fetchUser };
}
