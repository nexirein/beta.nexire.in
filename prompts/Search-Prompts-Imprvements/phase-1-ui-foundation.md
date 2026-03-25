# Phase 1 — UI Foundation: Black Theme, Layout, Sidebar
> Prepend MASTER_CONTEXT.md before running this prompt.
> Reference images: Ruixen AI (Screenshot-2026-03-07-at-11.02.02-AM.jpg), Juicebox sidebar (Screenshot-2026-03-07-at-11.26.41-AM-2.jpg)

## Goal
Build the complete application shell: global theme, sidebar navigation (Juicebox-inspired),
top bar, and the base layout that all pages will use. No placeholder data — wire to real DB.

---

## 1.1 — Global Theme (Tailwind Config)

Extend `tailwind.config.ts` with this custom theme:
```
colors:
  background: '#0A0A0A'
  surface: '#111111'
  surface-2: '#1A1A1A'
  border: '#222222'
  accent: '#7C3AED'          (purple-700)
  accent-light: '#A855F7'    (purple-500)
  accent-glow: rgba(124,58,237,0.15)
  text-primary: '#FFFFFF'
  text-secondary: '#A1A1AA'  (zinc-400)
  text-muted: '#52525B'      (zinc-600)
  success: '#10B981'
  warning: '#F59E0B'
  destructive: '#EF4444'

fontFamily:
  sans: ['Inter', 'sans-serif']

borderRadius:
  DEFAULT: '8px'
  lg: '12px'
  xl: '16px'
```

Set body background to `#0A0A0A` globally in `app/globals.css`.
Import Inter font from Google Fonts in `app/layout.tsx`.

---

## 1.2 — Sidebar Component

Create `components/layout/Sidebar.tsx` inspired by Juicebox sidebar structure. sidebar could shrinks in mans could close and appear fixing the logo above 

### Sidebar structure (top to bottom):
```
[Logo area]
  - Nexire logo (SVG or text with purple accent)
  - Collapse toggle button (top right of sidebar)

[Project Switcher]
  - Shows current project name with dropdown arrow
  - Click → opens ProjectSwitcherDropdown (list of all projects + "New Project" CTA)

[Navigation Items — under current project]
  - Searches (with + icon to create new search)
    - Sub-items: list last 3 search names, +N more if more exist
  - Shortlist (with count badge, purple pill)
  - Contacts
  - Sequences
  - Analytics (with right arrow indicating sub-pages)

[Divider]

[Global Navigation]
  - All Projects
  - All Agents (disabled, coming soon — show tooltip)

[Bottom Section]
  - Settings
  - Support
  - User avatar + name + workspace name
  - Getting Started progress bar (show % complete, like Juicebox)
  - Quick Find (⌘K shortcut badge shown inline)
```

### Sidebar visual specs:
- Width: 220px (expanded), 56px (collapsed — show only icons)
- Background: `#0D0D0D`
- Active item: purple left border (3px) + `#1A1A1A` background
- Hover: `#161616` background
- Icons: lucide-react, 16px, zinc-400 color, purple when active
- Section labels: 10px uppercase zinc-600 tracking-widest
- Smooth collapse animation with framer-motion (200ms)
- Project name truncated to 18 chars with ellipsis
- Search sub-items: 12px, indented 12px, truncated at 20 chars

---

## 1.3 — Top Bar Component

Create `components/layout/TopBar.tsx`:
- Breadcrumb: `[Project Name] > [Section] > [Search Name]` (match Juicebox style)
- Right side: Share button (outlined), "+ New Search" button (purple filled)
- "+ New Search" button triggers the Search Creation Modal (built in Phase 3)
- Height: 52px, border-bottom: 1px solid #222222

---

## 1.4 — App Layout

Create `app/(dashboard)/layout.tsx`:
- Full viewport layout: sidebar (fixed left) + main content (flex-1, scrollable)
- No padding on main content container — let child pages define their own
- Add `<Toaster>` from react-hot-toast with dark theme config

---

## 1.5 — Projects Dashboard Page

Create `app/(dashboard)/projects/page.tsx`:

Inspired by Juicebox Projects page (Screenshot-2026-03-07-at-11.26.41-AM-2.jpg).

### Layout:
- Left: Sidebar (already built)
- Main: Projects content area
- Right: 320px info panel (showing agent intro card + ATS connect card)

### Projects Table:
- Tabs: "My Projects" | "Shared Projects"
- Search bar: "Search for any project title, owner name, or collaborator name"
- Table columns: Title, Progress (avatar count + message count), Created on, Collaborators, Status
- Status badge: Active (green outlined pill), Archived (zinc outlined)
- Row hover: `#161616` background
- Each row clickable → navigates to `/projects/[projectId]/searches`
- "Create new project +" button — purple filled, top right, opens CreateProjectModal

### CreateProjectModal:
- Title input (required)
- Description textarea (optional)
- On submit: POST /api/projects → creates DB record → redirects to new project

### Right Panel Cards:
1. **Agent card**: Purple gradient header, shows "Introducing Agent — Meet your smart AI recruiting partner" with Learn More link (disabled for now, mark as coming soon)
2. **Connect ATS card**: "Import jobs from 42 platforms" with platform logo grid (use placeholder icons for now, mark as coming soon)

---

## 1.6 — Empty State for New Project

When a project has no searches, show in the main area:
- Centered illustration (simple SVG of magnifying glass)
- Headline: "Start your first search"
- Subtext: "Describe who you're looking for and let Nexire find the best candidates."
- CTA button: "New Search" (purple, large)

---

## Deliverable Checklist
- [ ] Tailwind theme extended with all custom colors
- [ ] Inter font loaded globally
- [ ] Sidebar renders with all navigation items
- [ ] Project switcher dropdown works
- [ ] Sidebar collapse/expand animation
- [ ] TopBar with breadcrumb
- [ ] Projects dashboard page with real DB data
- [ ] Create project modal functional
- [ ] Empty project state
- [ ] Mobile: sidebar collapses to bottom nav (responsive)
