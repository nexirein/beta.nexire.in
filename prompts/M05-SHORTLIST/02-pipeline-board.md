<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/shortlist.md       ← this module's API contract
-->

# M05 — TASK 02: PIPELINE BOARD (Kanban View)
# Trae: Read CLAUDE.md first.
# The Pipeline Board is the Kanban-style view inside each Project Detail page.
# Candidates move across columns via drag-and-drop (or stage dropdown).
# Columns = pipeline stages: Sourced → Reviewing → Shortlisted → Interviewing → Offered → Hired
# Also supports a compact List View toggle.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build PipelineBoard component:
1. Kanban columns: one per pipeline_stage (8 stages)
2. CandidateKanbanCard — compact card inside each column
3. Drag-and-drop via @dnd-kit/core (NOT react-beautiful-dnd — outdated)
4. Stage change via drag OR dropdown on card
5. Column counts + collapse toggle
6. "Hired" column: green accent, confetti on drop
7. "Rejected" column: grey, collapsed by default
8. Empty state per column

---

## INSTALL DEPENDENCY
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## DESIGN SPEC
Board wrapper:     overflow-x-auto flex gap-3 pb-4 min-h-[600px]
Column:            w-64 flex-shrink-0 bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl
Column header:     px-3 pt-3 pb-2 flex items-center justify-between
Stage pill color:  see STAGE_CONFIG below
Card:              bg-[#111111] border border-[#1A1A1A] rounded-xl p-3 hover:border-[#333333]
Drag active:       opacity-50, scale-95 rotate-1 on dragging card

---

## FILE 1 — lib/pipeline/stages.ts

```typescript
export type PipelineStage =
  | "sourced" | "reviewing" | "shortlisted" | "interviewing"
  | "offered" | "hired" | "rejected" | "on_hold";

export interface StageConfig {
  label:       string;
  color:       string;           // text color
  bg:          string;           // bg color (badge)
  border:      string;           // column border accent
  icon:        string;           // emoji
  collapsed:   boolean;          // default collapsed?
  terminal:    boolean;          // end state (hired/rejected)
}

export const STAGE_CONFIG: Record<PipelineStage, StageConfig> = {
  sourced: {
    label: "Sourced", color: "text-[#A0A0A0]",
    bg: "bg-[#1A1A1A]", border: "border-[#222222]",
    icon: "🔍", collapsed: false, terminal: false,
  },
  reviewing: {
    label: "Reviewing", color: "text-blue-400",
    bg: "bg-blue-400/10", border: "border-blue-400/20",
    icon: "👀", collapsed: false, terminal: false,
  },
  shortlisted: {
    label: "Shortlisted", color: "text-[#38BDF8]",
    bg: "bg-[#38BDF8]/10", border: "border-[#38BDF8]/20",
    icon: "⭐", collapsed: false, terminal: false,
  },
  interviewing: {
    label: "Interviewing", color: "text-purple-400",
    bg: "bg-purple-400/10", border: "border-purple-400/20",
    icon: "💬", collapsed: false, terminal: false,
  },
  offered: {
    label: "Offered", color: "text-yellow-400",
    bg: "bg-yellow-400/10", border: "border-yellow-400/20",
    icon: "📄", collapsed: false, terminal: false,
  },
  hired: {
    label: "Hired", color: "text-green-400",
    bg: "bg-green-400/10", border: "border-green-400/30",
    icon: "🎉", collapsed: false, terminal: true,
  },
  rejected: {
    label: "Rejected", color: "text-[#555555]",
    bg: "bg-[#1A1A1A]", border: "border-[#222222]",
    icon: "✕", collapsed: true, terminal: true,
  },
  on_hold: {
    label: "On hold", color: "text-orange-400",
    bg: "bg-orange-400/10", border: "border-orange-400/20",
    icon: "⏸", collapsed: true, terminal: false,
  },
};

export const VISIBLE_STAGES: PipelineStage[] = [
  "sourced","reviewing","shortlisted","interviewing","offered","hired","rejected","on_hold"
];
```

---

## FILE 2 — components/pipeline/CandidateKanbanCard.tsx

```tsx
"use client";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Mail, Phone, Star, GripVertical, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_CONFIG, PipelineStage, VISIBLE_STAGES } from "@/lib/pipeline/stages";

interface KanbanCardCandidate {
  shortlist_id:   string;
  candidate_id:   string;
  full_name:      string;
  headline?:      string;
  current_company?: string;
  email?:         string;
  phone?:         string;
  linkedin_url?:  string;
  rating?:        number | null;
  stage:          PipelineStage;
}

interface CandidateKanbanCardProps {
  entry:         KanbanCardCandidate;
  onStageChange: (shortlistId: string, newStage: PipelineStage) => void;
  onRemove:      (shortlistId: string) => void;
  onClick:       (entry: KanbanCardCandidate) => void;
}

export function CandidateKanbanCard({
  entry, onStageChange, onRemove, onClick,
}: CandidateKanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.shortlist_id,
    data: { entry },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const initials = (entry.full_name ?? "??")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-[#111111] border border-[#1A1A1A] rounded-xl p-3 group",
        "hover:border-[#333333] transition-all cursor-pointer",
        isDragging && "opacity-50 scale-95 rotate-1 shadow-2xl z-50"
      )}
    >
      {/* Drag handle + menu row */}
      <div className="flex items-center justify-between mb-2.5">
        <div
          {...attributes}
          {...listeners}
          className="p-0.5 rounded text-[#333333] hover:text-[#555555] cursor-grab active:cursor-grabbing transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Rating stars */}
        {entry.rating && (
          <div className="flex">
            {Array.from({ length: entry.rating }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
        )}

        {/* Menu */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1 rounded-md text-[#333333] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-6 z-20 bg-[#111111] border border-[#333333] rounded-xl shadow-xl w-44 py-1"
              onClick={e => e.stopPropagation()}
            >
              {VISIBLE_STAGES.filter(s => s !== entry.stage).map(stage => {
                const cfg = STAGE_CONFIG[stage];
                return (
                  <button
                    key={stage}
                    onClick={() => { onStageChange(entry.shortlist_id, stage); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#FAFAFA] transition-colors"
                  >
                    <span>{cfg.icon}</span>
                    Move to {cfg.label}
                  </button>
                );
              })}
              <div className="h-px bg-[#222222] my-1" />
              <button
                onClick={() => { onRemove(entry.shortlist_id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
              >
                Remove from board
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card body — clickable */}
      <div onClick={() => onClick(entry)}>
        {/* Avatar + name */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#FAFAFA] truncate">{entry.full_name}</p>
            {entry.current_company && (
              <p className="text-[10px] text-[#555555] truncate">{entry.current_company}</p>
            )}
          </div>
        </div>

        {/* Headline */}
        {entry.headline && (
          <p className="text-[10px] text-[#555555] truncate mb-2 leading-relaxed">
            {entry.headline}
          </p>
        )}

        {/* Contact badges */}
        <div className="flex items-center gap-1.5">
          {entry.email && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1A1A1A] text-[10px] text-[#555555]">
              <Mail className="w-2.5 h-2.5" />
              <span className="truncate max-w-[80px]">{entry.email.split("@")[0]}@…</span>
            </div>
          )}
          {entry.phone && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1A1A1A] text-[10px] text-[#555555]">
              <Phone className="w-2.5 h-2.5" />
            </div>
          )}
          {entry.linkedin_url && (
            <a
              href={entry.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1A1A1A] text-[10px] text-[#555555] hover:text-[#38BDF8] transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 3 — components/pipeline/PipelineBoard.tsx  (main board)

```tsx
"use client";
import { useState, useCallback } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_CONFIG, VISIBLE_STAGES, PipelineStage } from "@/lib/pipeline/stages";
import { CandidateKanbanCard } from "./CandidateKanbanCard";
import { useShortlist } from "@/hooks/useShortlist";
import { toast } from "sonner";

interface ShortlistEntry {
  shortlist_id:     string;
  candidate_id:     string;
  full_name:        string;
  headline?:        string;
  current_company?: string;
  email?:           string;
  phone?:           string;
  linkedin_url?:    string;
  rating?:          number | null;
  stage:            PipelineStage;
}

interface PipelineBoardProps {
  projectId:         string;
  initialEntries:    ShortlistEntry[];
  onCandidateClick:  (entry: ShortlistEntry) => void;
}

export function PipelineBoard({
  projectId, initialEntries, onCandidateClick,
}: PipelineBoardProps) {
  const [entries, setEntries]           = useState<ShortlistEntry[]>(initialEntries);
  const [dragging, setDragging]         = useState<ShortlistEntry | null>(null);
  const [collapsedCols, setCollapsed]   = useState<Set<PipelineStage>>(() => {
    const set = new Set<PipelineStage>();
    VISIBLE_STAGES.forEach(s => { if (STAGE_CONFIG[s].collapsed) set.add(s); });
    return set;
  });

  const { updateShortlist, removeFromProject } = useShortlist();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const columnEntries = useCallback((stage: PipelineStage) =>
    entries.filter(e => e.stage === stage), [entries]);

  const handleDragStart = (event: DragStartEvent) => {
    const entry = entries.find(e => e.shortlist_id === event.active.id);
    setDragging(entry ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Determine target stage from droppable id (column id = stage name)
    const targetStage = over.id as PipelineStage;
    if (!VISIBLE_STAGES.includes(targetStage)) return;

    const entry = entries.find(e => e.shortlist_id === active.id);
    if (!entry || entry.stage === targetStage) return;

    // Optimistic update
    setEntries(prev =>
      prev.map(e => e.shortlist_id === active.id ? { ...e, stage: targetStage } : e)
    );

    if (targetStage === "hired") {
      toast.success(`🎉 ${entry.full_name} marked as Hired!`);
    }

    // Persist
    const result = await updateShortlist(entry.shortlist_id, { stage: targetStage });
    if (!result) {
      // Revert optimistic update on failure
      setEntries(prev =>
        prev.map(e => e.shortlist_id === active.id ? { ...e, stage: entry.stage } : e)
      );
    }
  };

  const handleStageChange = async (shortlistId: string, newStage: PipelineStage) => {
    const entry = entries.find(e => e.shortlist_id === shortlistId);
    if (!entry) return;
    setEntries(prev => prev.map(e => e.shortlist_id === shortlistId ? { ...e, stage: newStage } : e));
    await updateShortlist(shortlistId, { stage: newStage });
  };

  const handleRemove = async (shortlistId: string) => {
    setEntries(prev => prev.filter(e => e.shortlist_id !== shortlistId));
    await removeFromProject(shortlistId);
  };

  const toggleCollapse = (stage: PipelineStage) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-6 pt-1 px-1 min-h-[500px]">
        {VISIBLE_STAGES.map(stage => {
          const cfg       = STAGE_CONFIG[stage];
          const col       = columnEntries(stage);
          const collapsed = collapsedCols.has(stage);

          return (
            <div
              key={stage}
              id={stage}   // droppable ID = stage name
              className={cn(
                "flex-shrink-0 rounded-2xl border transition-all duration-200",
                collapsed ? "w-12" : "w-64",
                cfg.border, "bg-[#0D0D0D]"
              )}
            >
              {/* Column header */}
              <div
                className={cn(
                  "flex items-center px-3 pt-3 pb-2.5 cursor-pointer select-none",
                  collapsed ? "flex-col gap-2 py-4" : "justify-between"
                )}
                onClick={() => toggleCollapse(stage)}
              >
                {collapsed ? (
                  <>
                    <span className="text-base">{cfg.icon}</span>
                    <span className={cn("text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180", cfg.color)}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-[#555555]">{col.length}</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{cfg.icon}</span>
                      <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-md font-medium",
                        cfg.bg, cfg.color
                      )}>
                        {col.length}
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-[#333333] hover:text-[#555555] transition-colors" />
                  </>
                )}
              </div>

              {/* Cards */}
              {!collapsed && (
                <SortableContext
                  items={col.map(e => e.shortlist_id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="px-2 pb-3 space-y-2 min-h-[80px]">
                    {col.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="w-5 h-5 text-[#222222] mb-2" />
                        <p className="text-[10px] text-[#333333]">Drop candidates here</p>
                      </div>
                    )}
                    {col.map(entry => (
                      <CandidateKanbanCard
                        key={entry.shortlist_id}
                        entry={entry}
                        onStageChange={handleStageChange}
                        onRemove={handleRemove}
                        onClick={onCandidateClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          );
        })}
      </div>

      {/* Drag overlay — ghost card while dragging */}
      <DragOverlay>
        {dragging && (
          <div className="bg-[#111111] border border-[#38BDF8]/40 rounded-xl p-3 w-64 shadow-2xl opacity-95 rotate-2 scale-105">
            <p className="text-xs font-semibold text-[#FAFAFA]">{dragging.full_name}</p>
            {dragging.current_company && (
              <p className="text-[10px] text-[#555555]">{dragging.current_company}</p>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
```

---

## FILE 4 — app/(app)/projects/[id]/page.tsx  (wire PipelineBoard into project detail)

Add this to the existing ProjectDetailClient (from M02):

```tsx
// Import at top:
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { CandidateSlideOver } from "@/components/reveal/CandidateSlideOver";

// Add state:
const [selectedEntry, setSelectedEntry] = useState<any>(null);
const [slideOverOpen, setSlideOverOpen] = useState(false);

// In JSX, replace or add below the existing project detail:
<PipelineBoard
  projectId={project.id}
  initialEntries={shortlistEntries}  // fetched server-side
  onCandidateClick={(entry) => {
    setSelectedEntry(entry);
    setSlideOverOpen(true);
  }}
/>

<CandidateSlideOver
  candidate={selectedEntry}
  open={slideOverOpen}
  onClose={() => setSlideOverOpen(false)}
  projects={allProjects}
  creditsBalance={creditsBalance}
  onCreditDeducted={() => setCreditsBalance(b => b - 1)}
/>
```

---

## COMPLETION CHECKLIST
- [ ] @dnd-kit installed (core + sortable + utilities)
- [ ] STAGE_CONFIG: all 8 stages with color, icon, collapsed default
- [ ] CandidateKanbanCard: drag handle, stage dropdown menu, contact badges
- [ ] PipelineBoard: all 8 columns, drag-and-drop persists via PATCH API
- [ ] Optimistic update on drag: immediate UI change, revert on failure
- [ ] Hired stage: toast "🎉 Hired!" on drop
- [ ] Rejected + On-hold columns: collapsed by default
- [ ] Column collapse toggles (vertical text when collapsed)
- [ ] Empty state: dashed "Drop candidates here" per column
- [ ] DragOverlay shows ghost card during drag

## BUILD LOG ENTRY
## M05-02 Pipeline Board — [date]
### Files: lib/pipeline/stages.ts, CandidateKanbanCard.tsx, PipelineBoard.tsx
### Status: ✅ Complete
