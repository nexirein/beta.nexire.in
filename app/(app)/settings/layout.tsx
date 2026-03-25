/**
 * app/(app)/settings/layout.tsx
 * Settings section layout with light-mode sidebar navigation
 */

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, CreditCard, Bell, Lock, Building2, Palette } from "lucide-react";

const SETTINGS_NAV = [
  { href: "/settings", label: "Appearance", icon: Palette },
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/workspace", label: "Workspace", icon: Building2 },
  { href: "/billing", label: "Billing & Credits", icon: CreditCard },
  { href: "/settings/notifications", label: "Notifications", icon: Bell, disabled: true },
  { href: "/settings/security", label: "Security", icon: Lock, disabled: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full gap-8">
      {/* Settings sidebar */}
      <aside className="w-48 flex-shrink-0">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Settings</p>
        <nav className="space-y-0.5">
          {SETTINGS_NAV.map((item) => {
            const isActive = item.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.disabled ? "#" : item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                  item.disabled
                    ? "cursor-not-allowed text-text-disabled opacity-50"
                    : isActive
                      ? "bg-brand-50 text-brand-600 font-medium"
                      : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
