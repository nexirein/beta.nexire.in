"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";
import { motion, AnimatePresence } from "framer-motion";

const COMPANY_SIZES = [
  { value: "1-10", label: "1–10 employees", desc: "Early-stage startup or boutique" },
  { value: "11-50", label: "11–50 employees", desc: "Growing team" },
  { value: "51-200", label: "51–200 employees", desc: "Mid-size company" },
  { value: "201+", label: "201+ employees", desc: "Enterprise or large org" },
];

const HIRING_VOLUMES = [
  { value: "1-5/mo", label: "1–5 per month", desc: "Occasional hiring" },
  { value: "6-20/mo", label: "6–20 per month", desc: "Regular pipeline" },
  { value: "21-50/mo", label: "21–50 per month", desc: "High-volume recruiting" },
  { value: "50+/mo", label: "50+ per month", desc: "Enterprise-scale hiring" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [orgName, setOrgName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [hiringVolume, setHiringVolume] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepTitles = [
    "Set up your workspace",
    "Tell us about your team",
    "How much do you hire?",
  ];
  const stepSubtitles = [
    "Tell us a little about you and your company",
    "This helps us tailor results to your scale",
    "We'll calibrate your experience to match your pace",
  ];

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || !jobTitle.trim()) return;
    setStep(2);
  }

  function handleStep2(size: string) {
    setCompanySize(size);
    setStep(3);
  }

  async function handleStep3(volume: string) {
    setHiringVolume(volume);
    setLoading(true);
    setError(null);

    const result = await completeOnboarding(orgName.trim(), jobTitle.trim(), companySize, volume);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.waitlisted) {
      router.push("/waitlist");
      return;
    }

    if (result.projectId) {
      router.push(`/search?project_id=${result.projectId}`);
    } else {
      router.push("/search");
    }
    router.refresh();
  }

  return (
    <div className="card animate-slide-up">
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              s <= step ? "w-8 bg-brand-500" : "w-8 bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-xl font-semibold text-center">{stepTitles[step - 1]}</h2>
          <p className="mt-1 text-center text-sm text-[var(--muted)]">{stepSubtitles[step - 1]}</p>

          {/* Step 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="mt-8 space-y-5">
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
                />
              </div>
              <button
                type="submit"
                disabled={!orgName.trim() || !jobTitle.trim()}
                className="btn-primary w-full"
              >
                Continue →
              </button>
            </form>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="mt-8 space-y-3">
              {COMPANY_SIZES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStep2(opt.value)}
                  className="w-full text-left px-4 py-3.5 rounded-xl border border-[var(--border)] bg-white hover:border-brand-400 hover:bg-brand-50/40 transition-all group"
                >
                  <div className="text-sm font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">{opt.label}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-[var(--muted)] hover:text-gray-600 mt-2 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="mt-8 space-y-3">
              {HIRING_VOLUMES.map((opt) => (
                <button
                  key={opt.value}
                  disabled={loading}
                  onClick={() => handleStep3(opt.value)}
                  className="w-full text-left px-4 py-3.5 rounded-xl border border-[var(--border)] bg-white hover:border-brand-400 hover:bg-brand-50/40 transition-all group disabled:opacity-60"
                >
                  <div className="text-sm font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">{opt.label}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">{opt.desc}</div>
                </button>
              ))}
              {loading && (
                <div className="flex items-center justify-center gap-2 pt-2 text-sm text-[var(--muted)]">
                  <svg className="h-4 w-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Setting up your workspace...
                </div>
              )}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full text-center text-xs text-[var(--muted)] hover:text-gray-600 mt-2 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
