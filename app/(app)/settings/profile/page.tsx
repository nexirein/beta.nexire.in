"use client";

/**
 * app/(app)/settings/profile/page.tsx
 * User profile settings — name, job title, timezone.
 */

import { useState, useEffect } from "react";
import { useUser } from "@/lib/hooks/useUser";
import { Loader2, Save, Camera, User } from "lucide-react";
import toast from "react-hot-toast";

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Singapore", "America/New_York", "America/Los_Angeles",
  "America/Chicago", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Dubai", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
  "Pacific/Auckland",
];

export default function SettingsProfilePage() {
  const { profile, org, loading, refresh } = useUser();
  const [form, setForm] = useState({
    full_name: "",
    job_title: "",
    timezone: "Asia/Kolkata",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        job_title: profile.job_title ?? "",
        timezone: profile.timezone ?? "Asia/Kolkata",
      });
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Profile saved!");
      await refresh();
    } catch {
      toast.error("Network error — please retry");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#52525B]" />
      </div>
    );
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Profile Settings</h1>
        <p className="mt-1 text-sm text-[#52525B]">Manage your personal information and preferences.</p>
      </div>

      {/* Avatar card */}
      <div className="flex items-center gap-5 rounded-2xl border border-[#222222] bg-[#111111] p-5">
        <div className="relative">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={initials}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[#7C3AED]/30"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7C3AED]/20 text-xl font-bold text-[#A855F7] ring-2 ring-[#7C3AED]/30">
              {initials}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#222222] bg-[#1A1A1A] text-[#52525B]">
            <Camera className="h-3 w-3" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-white">{profile?.full_name ?? "—"}</p>
          <p className="text-sm text-[#52525B]">{org?.name ?? "—"}</p>
          <p className="mt-1 text-xs text-[#52525B]">
            Workspace Plan: <span className="text-[#A855F7] font-medium capitalize">{org?.plan ?? "free"}</span>
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">Full Name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525B]" />
            <input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Your full name"
              className="w-full rounded-xl border border-[#222222] bg-[#0A0A0A] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#7C3AED]/50 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">Job Title</label>
          <input
            value={form.job_title}
            onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
            placeholder="e.g. Head of Talent Acquisition"
            className="w-full rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-2.5 text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#7C3AED]/50 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">Timezone</label>
          <select
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            className="w-full rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-2.5 text-sm text-white transition-colors focus:border-[#7C3AED]/50 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} className="bg-[#0A0A0A]">{tz}</option>
            ))}
          </select>
        </div>

        {/* Readonly email */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">Email</label>
          <div className="rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] px-4 py-2.5 text-sm text-[#52525B]">
            Connected via Google — managed by your OAuth provider
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </form>

      {/* Danger zone */}
      <div className="rounded-2xl border border-[#EF4444]/20 bg-[#EF4444]/5 p-5">
        <h3 className="mb-1 text-sm font-semibold text-[#EF4444]">Danger Zone</h3>
        <p className="mb-3 text-xs text-[#A1A1AA]">
          Deleting your account is permanent and cannot be undone.
        </p>
        <button
          disabled
          className="rounded-xl border border-[#EF4444]/30 px-4 py-2 text-xs font-medium text-[#EF4444] cursor-not-allowed opacity-50"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
