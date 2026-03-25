<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/client-dashboard.md ← this module's API contract
-->

# M07 — TASK 05: CLIENT NOTIFICATIONS  [ADDED — enhances UX]
# Trae: Read CLAUDE.md first.
# When key events happen on the client page (first view, feedback given, link expiring soon),
# recruiters are notified. This file wires in-app notifications to a
# NotificationBell in the top nav + a toast system for real-time events.
# Also sends optional email digest to recruiter when client is active.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Wire recruiter notifications for client view activity:
1. NotificationBell — top nav icon with unread count badge
2. NotificationDropdown — list of recent notifications with action links
3. GET /api/notifications — fetch unread + recent notifications
4. PATCH /api/notifications/[id]/read — mark as read
5. PATCH /api/notifications/read-all — mark all as read
6. Resend email alert: "Your client viewed the shortlist"  (optional, once per session)

---

## FILE 1 — app/api/notifications/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, metadata, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const unread_count = (notifications ?? []).filter(n => !n.is_read).length;

  return NextResponse.json({ notifications: notifications ?? [], unread_count });
}
```

---

## FILE 2 — app/api/notifications/[id]/read/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 3 — app/api/notifications/read-all/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — components/notifications/NotificationBell.tsx

```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Bell, BellDot } from "lucide-react";
import { NotificationDropdown } from "./NotificationDropdown";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen]           = useState(false);
  const [unread, setUnread]       = useState(0);
  const [notifications, setNots]  = useState<any[]>([]);
  const ref                       = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    const res  = await fetch("/api/notifications");
    const data = await res.json();
    setNots(data.notifications ?? []);
    setUnread(data.unread_count ?? 0);
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNots(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNots(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className={cn(
          "relative p-2 rounded-xl transition-all",
          open ? "bg-[#1A1A1A] text-[#FAFAFA]" : "text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A]"
        )}
      >
        {unread > 0 ? <BellDot className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#38BDF8] text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

---

## FILE 5 — components/notifications/NotificationDropdown.tsx

```tsx
"use client";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown, Eye, MessageSquare, Link2, CheckCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id:         string;
  type:       string;
  title:      string;
  body:       string | null;
  metadata:   any;
  is_read:    boolean;
  created_at: string;
}

interface Props {
  notifications:  Notification[];
  onMarkRead:     (id: string) => void;
  onMarkAllRead:  () => void;
  onClose:        () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  client_feedback:  ThumbsUp,
  sequence_reply:   MessageSquare,
  share_view:       Eye,
  share_link:       Link2,
};

const ICON_COLOR: Record<string, string> = {
  client_feedback:  "text-green-400 bg-green-400/10",
  sequence_reply:   "text-[#38BDF8] bg-[#38BDF8]/10",
  share_view:       "text-purple-400 bg-purple-400/10",
  share_link:       "text-yellow-400 bg-yellow-400/10",
};

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function NotificationDropdown({ notifications, onMarkRead, onMarkAllRead, onClose }: Props) {
  const router = useRouter();
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleClick = (n: Notification) => {
    if (!n.is_read) onMarkRead(n.id);
    // Navigate to relevant page based on notification type
    if (n.metadata?.link_id && n.metadata?.shortlist_id) {
      // Client feedback — go to project
      router.push(`/projects/${n.metadata.project_id ?? ""}`);
    } else if (n.metadata?.enrollment_id) {
      // Sequence reply — go to sequences
      router.push(`/sequences`);
    }
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-[#111111] border border-[#222222] rounded-2xl shadow-2xl z-50 overflow-hidden animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A]">
        <h3 className="text-sm font-semibold text-[#FAFAFA]">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 text-[10px] text-[#38BDF8] bg-[#38BDF8]/10 px-1.5 py-0.5 rounded-md">
              {unreadCount} new
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <div className="py-10 text-center">
            <Bell className="w-8 h-8 text-[#222222] mx-auto mb-2" />
            <p className="text-xs text-[#555555]">No notifications yet</p>
          </div>
        )}
        {notifications.map(n => {
          const Icon  = ICON_MAP[n.type] ?? Bell;
          const color = ICON_COLOR[n.type] ?? "text-[#555555] bg-[#1A1A1A]";
          return (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-[#0D0D0D] transition-colors border-b border-[#111111] last:border-0",
                !n.is_read && "bg-[#38BDF8]/5"
              )}
            >
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-xs leading-snug", n.is_read ? "text-[#A0A0A0]" : "text-[#FAFAFA] font-medium")}>
                    {n.title}
                  </p>
                  {!n.is_read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] flex-shrink-0 mt-1" />
                  )}
                </div>
                {n.body && (
                  <p className="text-[11px] text-[#555555] mt-0.5 truncate">{n.body}</p>
                )}
                <p className="text-[10px] text-[#333333] mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

---

## FILE 6 — Wire NotificationBell into TopNav

In `components/layout/TopNav.tsx`:
```tsx
import { NotificationBell } from "@/components/notifications/NotificationBell";

// In the right side of the nav, before the user avatar:
<NotificationBell />
```

---

## FILE 7 — Email alert when client first views link (optional Resend email)

Add to POST /api/share/[token]/view, after successful insert:

```typescript
// Check if this is the FIRST view (view_count was 0 before this)
const { data: linkBefore } = await supabase
  .from("share_links")
  .select("view_count, created_by, title, client_name")
  .eq("token", params.token)
  .single();

if (linkBefore?.view_count === 1) {
  // First ever view — email the recruiter
  const { data: recruiter } = await supabase
    .from("profiles")
    .select("full_name, email:id")
    .eq("id", linkBefore.created_by)
    .single();

  if (recruiter?.email) {
    // Use Resend to send a simple notification email
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    "Nexire Alerts <alerts@nexire.in>",
      to:      recruiter.email,
      subject: `👀 ${linkBefore.client_name ?? "Your client"} just viewed the shortlist`,
      text:    `${linkBefore.client_name ?? "Someone"} just opened your candidate shortlist "${linkBefore.title ?? ""}". Check Nexire for their feedback.`,
    });
  }
}
```

---

## COMPLETION CHECKLIST
- [ ] GET /api/notifications: returns 30 most recent notifications, unread count
- [ ] PATCH /api/notifications/[id]/read: marks single notification read
- [ ] PATCH /api/notifications/read-all: bulk marks all unread as read
- [ ] NotificationBell: BellDot icon when unread > 0, badge counter, polls every 30s
- [ ] NotificationDropdown: icon + color per type, unread dot, time ago, mark all read
- [ ] Dropdown click navigates to relevant page (project or sequences)
- [ ] TopNav updated to include <NotificationBell />
- [ ] Optional: recruiter email sent on first client view via Resend
- [ ] Notification types covered: client_feedback, sequence_reply, share_view

## BUILD LOG ENTRY
## M07-05 Client Notifications — [date]
### Files: notifications API, NotificationBell, NotificationDropdown, TopNav integration
### M07 COMPLETE ✅ — All 5 files done
### Status: ✅ Complete
