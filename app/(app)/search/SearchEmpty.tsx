import { Sparkles, Search } from "lucide-react";

const EXAMPLES = [
  "Senior React developer, Bangalore, 5+ years",
  "Python ML engineer with AWS, Hyderabad",
  "Node.js backend, Pune, startup background",
  "Full-stack MERN, remote, 3-6 years",
];

interface SearchEmptyProps {
  onExampleClick?: (query: string) => void;
}

export function SearchEmpty({ onExampleClick }: SearchEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-8 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
        <Sparkles className="w-7 h-7 text-brand-400" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Find your next hire</h2>
      <p className="text-sm text-[var(--muted)] mb-8 text-center max-w-sm">
        Type a role, location, and skills — or use filters to narrow it down.
        AI will rank and score every result.
      </p>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-xs text-[var(--muted)] text-center mb-3">Try one of these</p>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => onExampleClick?.(ex)}
            className="flex items-center gap-3 w-full text-left px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-brand-500/30 cursor-pointer transition-all group"
          >
            <Search className="w-3.5 h-3.5 text-[var(--muted)] group-hover:text-brand-400" />
            <span className="text-sm text-[var(--muted)] group-hover:text-[var(--foreground)]">{ex}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
