"use client";

import { type ArchetypeResult } from "../../lib/archetypes";

export function PersonalityCard({ result }: { result: ArchetypeResult }) {
  return (
    <div
      className="border bg-[var(--bg-secondary)] p-4"
      style={{ borderColor: `${result.color}30` }}
    >
      <div className="mb-2 flex items-center gap-3">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: result.color }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: result.color }}
        >
          {result.archetype}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        {result.narrative}
      </p>
    </div>
  );
}
