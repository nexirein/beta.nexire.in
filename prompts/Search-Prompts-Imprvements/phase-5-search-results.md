# Phase 5 — Search Results UI (List View + Table View + Profile Panel)
> Prepend MASTER_CONTEXT.md before running this prompt.
> Reference images:
>   List view: Screenshot-2026-03-07-at-11.31.51-AM-3.jpg + Screenshot-2026-03-07-at-11.32.56-AM-5.jpg
>   Table view: Screenshot-2026-03-07-at-11.32.07-AM-4.jpg
>   Profile panel: right side of Screenshot-2026-03-07-at-11.31.51-AM-3.jpg

## Goal
Build the complete search results page with two views (list/table), infinite pagination,
and the right-side profile panel that opens when a candidate is clicked.

---

## 5.1 — Search Results Page Layout

Create `app/(dashboard)/projects/[projectId]/searches/[searchId]/page.tsx`:

### Layout:
```
[TopBar: Project > Searches > Search Name] [Share] [+ New Search]

[Search Input Bar — shows current search name, editable]    [Filters {N}]  [Criteria {N}]

[Results Header: Results tab | Insights tab]

[Results Content — takes remaining width]
                                          [Profile Panel — slides in from right, 420px]
```

- When profile panel is open: results area shrinks, panel takes 420px on right
- Profile panel opens/closes with smooth slide animation (300ms, framer-motion)
- Profile open state driven by URL `?contact=cont_xxx`

---

## 5.2 — Results Header Bar

```
☐ ▾  Matches (176)  [≡ List] [⊞ Table]  [Review]       1 - 15 of 176 ›
```
- Checkbox: select all on current page
- Matches count: formatted with comma separator
- View toggle: List icon / Table icon — switch between views
- Review button: opens a review mode (future — show as disabled for now)
- Pagination: "1 - 15 of 176 ›" with prev/next arrows
- On view switch: preserve selected items, scroll to top

---

## 5.3 — List View (Classic View)

Inspired by Juicebox list view (Screenshots 3 and 5).

### Candidate Card Structure:
```
☐  [Name]  [External Link Icon]  [LinkedIn Icon]  [Twitter Icon]          [👁 View] [Shortlist ▾]
   🔴 Current Title at Company • City, State, Country
   🎓 Degree, Field at University Name

   [✅ Tag1]  Explanation text for tag 1 matching the search criteria...
   [✅ Tag2]  Explanation text for tag 2...
   [✅ Tag3]  Explanation text for tag 3...
```

### Card Specs:
- Background: `#111111`, border: 1px `#222222`, border-radius: 12px
- Hover: border color `#333333`, subtle shadow
- Name: 15px semibold white
- Title line: 13px zinc-400, company name in white
- Location: 13px zinc-500
- Education: 13px zinc-500
- Match tags: green rounded pill (background `#052E16`, text `#22C55E`, border `#166534`)
  Tag text: 12px bold inside pill
  Tag explanation: 13px zinc-300 inline after pill (like Juicebox)
- Max 5 match tags per card (collapse rest behind "See more")
- Shortlist button: outlined zinc, on click → filled purple + "Shortlisted" text
- View button: eye icon, ghost style
- Right-click on card OR clicking name → opens profile panel (updates URL)

### What match tags to show:
The tags come from the `filtersApplied` of the search. For each active filter, generate
a tag label that summarizes why this candidate matches. Logic:
- Tech filter active → show "Python" tag if person's company uses Python
- Seniority filter → show "Senior" tag
- Industry filter → show "FinTech" tag
- Experience filter → show "6 years exp" tag
These are generated client-side by comparing the person/company data against the search filters.

### Pagination:
- Show 25 results per page (Prospeo limit)
- Pagination controls at bottom: ← 1 2 3 ... 7 →
- On page change: fetch from cache or API, scroll to top

---

## 5.4 — Table View

Inspired by Juicebox table view (Screenshot 4).

### Table Columns:
```
☐ | Name | Profiles | Job Title | Company | Shortlist Status | Match | Experience | B2B (criteria col)
```

Column specs:
- **Name**: First + Last name, 14px white
- **Profiles**: LinkedIn icon, Twitter/X icon (link out)
- **Job Title**: Current title, 13px zinc-300, truncated at 28 chars
- **Company**: Company logo (favicon from clearbit or placeholder), company name 13px
- **Shortlist Status**: "Shortlist" text pill (outlined) or "Shortlisted" (filled purple)
- **Match**: percentage badge (e.g. "100%") — calculate based on how many active filters the candidate satisfies
- **Experience**: "7 yrs 5 mos" formatted string
- **Dynamic criteria columns**: For each active filter category in the search, add a column with a thumbs-up/thumbs-down icon based on whether candidate matches

Table specs:
- Row height: 56px
- Header: sticky, background `#0D0D0D`, 12px zinc-500 uppercase
- Row hover: `#161616`
- Row click → opens profile panel
- Company logo: 20x20px rounded, fallback to company initial in zinc circle

---

## 5.5 — Profile Panel (Right Side)

When a candidate is clicked:
1. Push `?contact=cont_xxx` to URL
2. Slide in a 420px panel from the right
3. Mark result as viewed (PATCH /api/searches/.../results/.../viewed)

### Panel Header:
```
[✕ Close]                                    [← prev] [→ next]
[Name]  [LinkedIn] [Twitter]              [Full Profile ↗]
[Current Title • City, State, Country]
```

### Panel Tabs:
```
Overview | Experience | Education | Skill Map
```

### Overview Tab:
- "Manage Contact" section with three-dot menu (add note, add tag, remove)
- "Reveal Email (1 credit)" button → calls reveal-email API → shows email after confirm dialog
- "+ Add Manually" link
- "Add to Shortlist" dropdown button (purple)
- "Add to First Sequence →" button (disabled, coming soon)
- Notes count: "1 note" link
- Tags: "Add Tags" input

- Attribute pills below contact section (generated from company data):
  Example: `Web3` `Early + Growth` `Big 4` `Backend` `FinTech`
  These are generated from company_technology + company_industry + company_funding data

- **Experiences section**:
  Three stat boxes: AVERAGE TENURE | CURRENT TENURE | TOTAL EXPERIENCE
  Format: "8 mos", "1 yrs 3 mos", "7 yrs 5 mos"

- **Experience list** (most recent first):
  Each entry: Company logo + Company name + Job Title + Date range + Location
  "Unlock Compensation Estimate" (disabled, coming soon)

### Experience Tab:
Full work history list. Each entry:
- Company logo (favicon), company name, role, dates, location, description snippet
- "Read More" expander for long descriptions

### Education Tab:
Education history: Institution name, degree, field, years

### Skill Map Tab:
Technologies from company data shown as tag cloud.

### Panel Navigation:
- ← → arrows navigate between candidates in current page
- Arrow key support (left/right) when panel is open
- ESC closes panel (removes ?contact from URL)

### "Full Profile" link:
Opens a full-page profile at `/projects/[projectId]/contacts/[contactId]` (Phase 8 feature — for now show placeholder)

---

## 5.6 — Search Bar & Criteria Button

At top of results page:
- **Search name input**: shows current search name, click to rename inline (calls PATCH API)
- **Filters button**: shows count of active filters (e.g. "Filters 11") → opens Filter Modal pre-populated
- **Criteria button**: shows count of active criteria tags (e.g. "Criteria 5") → opens a lightweight criteria editor panel showing which tags are being matched

---

## 5.7 — Insights Tab (Future, Placeholder)

Show a placeholder card: "Insights coming soon — we're analyzing patterns across your search results."
With a shimmer/loading-like animation to make it feel in progress.

---

## Deliverable Checklist
- [ ] Search results page loads with real data from DB/cache
- [ ] List view renders all candidate cards correctly
- [ ] Match tags generated from filter comparison
- [ ] Table view with all columns
- [ ] View toggle switches between list/table smoothly
- [ ] Pagination works (fetches page 2+ from API/cache)
- [ ] Profile panel slides in on candidate click
- [ ] URL updates with ?contact= when panel opens
- [ ] Profile panel tabs: Overview, Experience, Education, Skill Map
- [ ] Reveal email button with credit confirmation dialog
- [ ] Shortlist button in both list + table view
- [ ] Arrow key navigation between candidates
- [ ] ESC closes profile panel
- [ ] Filter button opens modal pre-populated with current search filters
