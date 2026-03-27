"use client";

import { useState } from "react";
import { Zap, Clock, Mail } from "lucide-react";

export default function WaitlistPage() {
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 h-screen w-full flex bg-white font-sans">
      {/* Left — content */}
      <div className="w-full lg:w-1/2 flex flex-col px-8 py-12 lg:px-16 xl:px-24 justify-center relative min-h-full">
        {/* Logo */}
        <div className="absolute top-8 left-8 lg:top-12 lg:left-12">
          {!logoError ? (
            <img
              src="/assets/logos/logo.png"
              alt="Nexire"
              className="max-h-8 w-auto object-contain object-left"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-brand-600 tracking-tight">Nexire</span>
            </div>
          )}
        </div>

        <div className="max-w-sm w-full mx-auto mt-16 lg:mt-0">
          {/* Icon */}
          <div className="mb-6 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Clock className="w-7 h-7 text-amber-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center">
            You&apos;re on the list
          </h2>
          <p className="mt-3 text-sm text-gray-500 text-center leading-relaxed max-w-xs mx-auto">
            Nexire is currently invite-only for teams with active hiring pipelines. We&apos;ll reach out as soon as a spot opens up.
          </p>

          {/* What happens next */}
          <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">What happens next</p>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <Mail className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">We&apos;ll email you</p>
                <p className="text-xs text-gray-400 mt-0.5">Our team reviews applications manually and reaches out with login credentials.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Priority access</p>
                <p className="text-xs text-gray-400 mt-0.5">Teams hiring at higher volumes get earlier access during the beta.</p>
              </div>
            </div>
          </div>

          <a
            href="/login"
            className="mt-6 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 flex justify-center items-center"
          >
            Back to login
          </a>

          <p className="mt-6 text-center text-xs text-gray-400">
            Questions? Write to us at{" "}
            <a href="mailto:hello@nexire.in" className="text-brand-500 hover:underline">
              hello@nexire.in
            </a>
          </p>
        </div>
      </div>

      {/* Right — image */}
      <div className="hidden lg:block lg:w-1/2 p-3 relative h-screen">
        <div className="w-full h-full relative rounded-[2rem] overflow-hidden bg-gray-900 shadow-xl">
          <img
            src="/assets/auth_hero.png"
            alt="Nexire"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-20 pb-64">
            <h2 className="text-white text-3xl xl:text-4xl leading-snug font-medium max-w-xl mx-auto drop-shadow-md">
              The best talent teams move faster than the rest
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}
