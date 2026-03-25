/**
 * app/(app)/layout.tsx
 * Protected app layout — requires auth (enforced by middleware.ts).
 * Renders Sidebar + Topbar + main content.
 * Design: Section 5 of Build Brief — light mode, Nexire Blue (#4C6DFD)
 */

import { Toaster } from "react-hot-toast";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ThemeProvider } from "@/lib/hooks/useTheme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "#FFFFFF" }}>
        {/* Sidebar — fixed width, full height, collapsible */}
        <Sidebar />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <Topbar />

          {/* Page content */}
          <main
            className="flex-1 overflow-y-auto bg-surface p-0"
          >
            {children}
          </main>
        </div>

        {/* Global Toast notifications — light mode */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#FFFFFF",
              color: "#0F1629",
              border: "1px solid #E8ECFF",
              borderRadius: "12px",
              fontSize: "13px",
              boxShadow: "0 4px 20px rgba(76, 109, 253, 0.12)",
            },
            success: {
              iconTheme: { primary: "#10B981", secondary: "#FFFFFF" },
            },
            error: {
              iconTheme: { primary: "#EF4444", secondary: "#FFFFFF" },
            },
          }}
        />
      </div>
    </ThemeProvider>
  );
}


