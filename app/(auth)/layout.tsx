/**
 * app/(auth)/layout.tsx
 * Auth pages layout — centered card with Nexire branding.
 * Used by: /login, /signup, /onboarding
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-brand-500/8 blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              Nexire
            </span>
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            AI-Powered Recruitment Intelligence
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
