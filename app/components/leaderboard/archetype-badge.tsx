"use client";

import { type Archetype, getArchetypeColor } from "../../lib/archetypes";

export function ArchetypeBadge({ archetype }: { archetype: Archetype }) {
  const color = getArchetypeColor(archetype);

  return (
    <span
      className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{
        color,
        backgroundColor: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      {archetype}
    </span>
  );
}
