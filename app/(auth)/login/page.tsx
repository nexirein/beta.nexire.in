"use client";

/**
 * app/(auth)/login/page.tsx
 * Login page — Google OAuth + Magic Link (email OTP).
 */

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  
  // Login states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Request Credentials states
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqMobile, setReqMobile] = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqRole, setReqRole] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoError, setLogoError] = useState(false);
  
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/search";

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Redirect to next path
      window.location.href = next;
    }
  }

  async function handleRequestCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!reqName.trim() || !reqEmail.trim() || !reqMobile.trim() || !reqCompany.trim() || !reqRole.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_APP_SCRIPT_URL;
      if (!scriptUrl) {
        throw new Error("System configuration missing. Please contact support.");
      }
      
      await fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: reqName,
          email: reqEmail,
          mobile: reqMobile,
          company: reqCompany,
          role: reqRole,
        }),
      });
      
      setSuccess(true);
      setReqName("");
      setReqEmail("");
      setReqMobile("");
      setReqCompany("");
      setReqRole("");
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 h-screen w-full flex bg-white font-sans overflow-y-auto">
      {/* Left Column - Form */}
      <div className="w-full lg:w-1/2 flex flex-col px-8 py-12 lg:px-16 xl:px-24 justify-center relative min-h-full">
        {/* Logo at Top Left */}
        <div className="absolute top-8 left-8 lg:top-12 lg:left-12">
          {!logoError ? (
            <img src="/assets/logos/logo.png" alt="Company Logo" className="max-h-8 w-auto object-contain object-left" onError={() => setLogoError(true)} />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-brand-600 tracking-tight">Nexire</span>
            </div>
          )}
        </div>

        {/* Central Form Container */}
        <div className="max-w-sm w-full mx-auto mt-16 lg:mt-0 animate-slide-up">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {isLogin ? "Talent login" : "Request credentials"}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {isLogin 
              ? "Sign in to your invite-only Nexire account" 
              : "Fill out the form below to request access to the beta"}
          </p>

          {success && !isLogin ? (
            <div className="mt-8 mb-6 p-6 text-center rounded-xl bg-green-50 border border-green-200 animate-slide-up">
              <h3 className="text-lg font-bold text-green-800 mb-2">Request Submitted</h3>
              <p className="text-sm text-green-700">
                Your request has been submitted successfully. We will review and send your credentials manually.
              </p>
              <button
                onClick={() => {
                  setSuccess(false);
                  setIsLogin(true);
                  setError(null);
                }}
                className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-green-600/25 transition-all hover:bg-green-700"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={isLogin ? handleLogin : handleRequestCredentials} className="mt-8 space-y-5">
              {isLogin ? (
                <>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Your email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email address"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                      disabled={loading}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Row 1: Name + Email */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reqName" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        id="reqName"
                        type="text"
                        value={reqName}
                        onChange={(e) => setReqName(e.target.value)}
                        placeholder="John Doe"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label htmlFor="reqEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Email Address
                      </label>
                      <input
                        id="reqEmail"
                        type="email"
                        value={reqEmail}
                        onChange={(e) => setReqEmail(e.target.value)}
                        placeholder="john@company.com"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Row 2: Mobile + Company */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reqMobile" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Mobile Number
                      </label>
                      <input
                        id="reqMobile"
                        type="tel"
                        value={reqMobile}
                        onChange={(e) => setReqMobile(e.target.value)}
                        placeholder="+91 98765 43210"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label htmlFor="reqCompany" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Company Name
                      </label>
                      <input
                        id="reqCompany"
                        type="text"
                        value={reqCompany}
                        onChange={(e) => setReqCompany(e.target.value)}
                        placeholder="Acme Corp"
                        required
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Row 3: Role (full width) */}
                  <div>
                    <label htmlFor="reqRole" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Your Role
                    </label>
                    <input
                      id="reqRole"
                      type="text"
                      value={reqRole}
                      onChange={(e) => setReqRole(e.target.value)}
                      placeholder="e.g. Talent Acquisition Lead, CHRO, Founder"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading || (isLogin ? (!email.trim() || !password) : (!reqName.trim() || !reqEmail.trim() || !reqMobile.trim() || !reqCompany.trim() || !reqRole.trim()))}
                className="w-full rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-700 disabled:opacity-70 flex justify-center items-center mt-2"
              >
                {loading ? (
                   <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                   </svg>
                ) : (
                  isLogin ? "Continue" : "Submit Request"
                )}
              </button>
            </form>
          )}

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 animate-slide-up">
              {error}
            </div>
          )}

          {!success && (
            <div className="mt-8 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-400 text-xs uppercase tracking-widest">or</span>
              </div>
            </div>
          )}
          
          {!success && (
            <div className="mt-8 text-center text-sm">
              {isLogin ? (
                <button 
                  type="button" 
                  onClick={() => { setIsLogin(false); setError(null); }} 
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 flex justify-center items-center"
                >
                  Request Access
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={() => { setIsLogin(true); setError(null); }} 
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 flex justify-center items-center"
                >
                  Already have an account? Sign in
                </button>
              )}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-gray-400">
            By continuing, you agree to our Terms of Service.
          </p>
        </div>
      </div>

      {/* Right Column - Image */}
      <div className="hidden lg:block lg:w-1/2 p-3 relative h-screen">
        <div className="w-full h-full relative rounded-[2rem] overflow-hidden bg-gray-900 shadow-xl">
          <img src="/assets/auth_hero.png" alt="Inspiring Landscape" className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-10000 hover:scale-105" />
          <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
          
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center p-20 pb-64">
            <h2 className="text-white text-3xl xl:text-4xl leading-snug font-medium max-w-xl mx-auto drop-shadow-md">
              Behind every great company is someone who found the right people
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="card flex items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
