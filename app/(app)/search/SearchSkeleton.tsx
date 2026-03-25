export function SearchSkeleton() {
  return (
    <div className="p-6 grid grid-cols-1 gap-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <div className="h-4 w-48 bg-[var(--surface-raised)] rounded-lg" />
              <div className="h-3 w-32 bg-[var(--surface-raised)] rounded-lg" />
            </div>
            <div className="h-6 w-16 bg-[var(--surface-raised)] rounded-xl" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-[var(--surface-raised)] rounded-lg" />
            <div className="h-5 w-16 bg-[var(--surface-raised)] rounded-lg" />
            <div className="h-5 w-24 bg-[var(--surface-raised)] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
