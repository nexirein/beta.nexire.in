"use client";

/**
 * app/(auth)/onboarding/page.tsx
 * Post-signup onboarding — collects org name + job title.
 * Uses a server action (actions.ts) with the admin client to bypass RLS.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || !jobTitle.trim()) return;

    setLoading(true);
    setError(null);

    const result = await completeOnboarding(orgName.trim(), jobTitle.trim());

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.projectId) {
      router.push(`/projects/${result.projectId}`);
    } else {
      router.push("/projects");
    }
    router.refresh();
  }

  return (
    <div className="card animate-slide-up">
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        <div className="h-1.5 w-8 rounded-full bg-brand-500" />
        <div className="h-1.5 w-8 rounded-full bg-[var(--border)]" />
        <div className="h-1.5 w-8 rounded-full bg-[var(--border)]" />
      </div>

      <h2 className="text-xl font-semibold text-center">Set up your workspace</h2>
      <p className="mt-1 text-center text-sm text-[var(--muted)]">
        Tell us a little about you and your company
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="orgName" className="block text-sm font-medium mb-1.5">
            Company / Organisation name
          </label>
          <input
            id="orgName"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Recruiting Co."
            required
            maxLength={80}
            className="input-field"
            disabled={loading}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="jobTitle" className="block text-sm font-medium mb-1.5">
            Your role
          </label>
          <input
            id="jobTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Recruiter, Talent Lead"
            required
            maxLength={80}
            className="input-field"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !orgName.trim() || !jobTitle.trim()}
          className="btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Setting up workspace...
            </span>
          ) : (
            "Continue to Nexire →"
          )}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
