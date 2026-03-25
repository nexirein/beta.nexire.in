<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/client-dashboard.md ← this module's API contract
-->

# M07 — TASK 03: TRACKING ANALYTICS
# Trae: Read CLAUDE.md first.
# Every time a client opens a share link, Nexire logs the event.
# Recruiters see view count, last viewed time, and geographic location
# inside the ShareLinkModal and on the project detail page.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build link tracking:
1. share_link_views table — log each view event
2. POST /api/share/[token]/view — log a view (called on page load)
3. GET  /api/share/[token]/views — return view history (recruiter only)
4. Update share_links.view_count + last_viewed_at on each view
5. ViewHistoryPanel component — shown inside ShareLinkModal

---

## FILE 1 — Supabase SQL: share_link_views table

```sql
CREATE TABLE share_link_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  viewed_at    TIMESTAMPTZ DEFAULT NOW(),
  ip_hash      TEXT,                   -- SHA-256 hashed IP (privacy safe)
  country      TEXT,                   -- from Vercel edge geo header
  city         TEXT,
  user_agent   TEXT,
  referrer     TEXT,
  duration_sec INTEGER                 -- updated on page leave (beacon)
);

CREATE INDEX idx_share_link_views_link ON share_link_views(link_id, viewed_at DESC);

-- No RLS on this table (only written by service role, read via API with token check)
```

---

## FILE 2 — app/api/share/[token]/view/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createHash } from "crypto";

export const runtime = "edge";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase  = createServiceClient();
  const body      = await req.json().catch(() => ({}));

  const { data: link } = await supabase
    .from("share_links")
    .select("id, is_active")
    .eq("token", params.token)
    .single();

  if (!link?.is_active) return NextResponse.json({ ok: false });

  // Geo from Vercel edge
  const country = req.headers.get("x-vercel-ip-country") ?? null;
  const city    = req.headers.get("x-vercel-ip-city")    ?? null;

  // Hash IP for privacy (GDPR-compliant)
  const ip      = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const ipHash  = ip ? createHash("sha256").update(ip + process.env.IP_HASH_SALT!).digest("hex").slice(0, 16) : null;

  const ua      = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  const referrer= req.headers.get("referer")?.slice(0, 200)    ?? null;

  // Insert view log
  await supabase.from("share_link_views").insert({
    link_id:    link.id,
    ip_hash:    ipHash,
    country,
    city,
    user_agent: ua,
    referrer,
  });

  // Update view_count + last_viewed_at on share_links
  await supabase
    .from("share_links")
    .update({
      view_count:     supabase.rpc("increment_view_count"),  // or use RPC below
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", link.id);

  // Use RPC for atomic increment instead:
  await supabase.rpc("increment_share_link_views", { p_link_id: link.id });

  return NextResponse.json({ ok: true });
}
```

---

## FILE 3 — Supabase RPC: increment view count

```sql
CREATE OR REPLACE FUNCTION increment_share_link_views(p_link_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE share_links
  SET view_count     = view_count + 1,
      last_viewed_at = NOW(),
      updated_at     = NOW()
  WHERE id = p_link_id;
END; $$;
```

---

## FILE 4 — app/api/share/[token]/views/route.ts  (recruiter only)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  // Auth check — recruiter must be logged in
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Verify link belongs to org
  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: link } = await service
    .from("share_links")
    .select("id, view_count, last_viewed_at")
    .eq("token", params.token)
    .eq("org_id", profile?.org_id)
    .single();

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: views } = await service
    .from("share_link_views")
    .select("id, viewed_at, country, city, duration_sec")
    .eq("link_id", link.id)
    .order("viewed_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    total_views:    link.view_count,
    last_viewed_at: link.last_viewed_at,
    views:          views ?? [],
  });
}
```

---

## FILE 5 — components/share/ViewHistoryPanel.tsx  (shown in ShareLinkModal)

```tsx
"use client";
import { useEffect, useState } from "react";
import { Eye, MapPin, Clock, Globe } from "lucide-react";

interface ViewEntry {
  id:           string;
  viewed_at:    string;
  country:      string | null;
  city:         string | null;
  duration_sec: number | null;
}

interface Props {
  token: string;
}

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c: string) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

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

export function ViewHistoryPanel({ token }: Props) {
  const [views, setViews]     = useState<ViewEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/share/${token}/views`)
      .then(r => r.json())
      .then(d => {
        setViews(d.views ?? []);
        setTotal(d.total_views ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-xs text-[#555555] py-2">Loading views...</p>;
  if (views.length === 0) return (
    <p className="text-xs text-[#333333] py-2">No views recorded yet.</p>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-3.5 h-3.5 text-[#555555]" />
        <span className="text-[11px] text-[#555555] font-medium uppercase tracking-wider">
          {total} total view{total !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {views.map(v => (
          <div key={v.id} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              {v.country && (
                <span className="text-sm" title={v.country}>
                  {countryFlag(v.country)}
                </span>
              )}
              <span className="text-xs text-[#A0A0A0]">
                {v.city ? `${v.city}, ${v.country}` : v.country ?? "Unknown location"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#555555]">
              {v.duration_sec && (
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {v.duration_sec < 60 ? `${v.duration_sec}s` : `${Math.round(v.duration_sec / 60)}m`}
                </span>
              )}
              <span>{timeAgo(v.viewed_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## FILE 6 — Duration tracking on client page (beacon on close)

Add to ClientPageShell.tsx useEffect:

```typescript
useEffect(() => {
  const startTime = Date.now();

  // Track duration on page leave using sendBeacon (works on tab close)
  const handleUnload = () => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    // sendBeacon does NOT need async/await — fires and forgets
    navigator.sendBeacon(
      `/api/share/${token}/duration`,
      JSON.stringify({ duration_sec: duration })
    );
  };

  window.addEventListener("beforeunload", handleUnload);
  return () => window.removeEventListener("beforeunload", handleUnload);
}, [token]);
```

---

## FILE 7 — app/api/share/[token]/duration/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();
  const { duration_sec } = await req.json().catch(() => ({}));
  if (!duration_sec || typeof duration_sec !== "number") {
    return NextResponse.json({ ok: false });
  }

  // Find the most recent view for this token, update duration
  const { data: link } = await supabase
    .from("share_links").select("id").eq("token", params.token).single();
  if (!link) return NextResponse.json({ ok: false });

  await supabase
    .from("share_link_views")
    .update({ duration_sec: Math.min(duration_sec, 3600) })
    .eq("link_id", link.id)
    .is("duration_sec", null)
    .order("viewed_at", { ascending: false })
    .limit(1);

  return NextResponse.json({ ok: true });
}
```

---

## ENV VAR
```
IP_HASH_SALT=your_random_salt_here   # used to salt IP hash for privacy
```

---

## COMPLETION CHECKLIST
- [ ] share_link_views table with link_id, ip_hash, country, city, ua, duration_sec
- [ ] POST /api/share/[token]/view: logs view with country from Vercel edge headers
- [ ] IP hashed with SHA-256 + salt (GDPR-compliant, never stores raw IP)
- [ ] increment_share_link_views RPC: atomic view_count increment
- [ ] GET /api/share/[token]/views: recruiter-only, returns 20 most recent views
- [ ] ViewHistoryPanel: flag emoji, city/country, time ago, duration
- [ ] Duration tracking via sendBeacon on beforeunload
- [ ] POST /api/share/[token]/duration: updates most recent view duration_sec
- [ ] IP_HASH_SALT env var added to .env.local + Vercel

## BUILD LOG ENTRY
## M07-03 Tracking Analytics — [date]
### Files: share_link_views SQL + RPC, view/views/duration API routes, ViewHistoryPanel
### Status: ✅ Complete
