"use client";

export function ComingSoonBanner({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-violet)]">
        Coming Soon
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {title}
      </span>
      <span className="text-[10px] text-[var(--text-muted)]">
        {description}
      </span>
    </div>
  );
}
