import Image from "next/image";

const AGENT_ICONS: Record<string, string> = {
  gpt: "/gpticon.png",
  grok: "/grokicon.png",
};

/** Resolve an agent name to its icon path, or null if none exists */
export function resolveIcon(agentName: string): string | null {
  const lower = agentName.toLowerCase();
  for (const [key, src] of Object.entries(AGENT_ICONS)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

/** Get the first initial letter for monogram display */
export function getAgentInitial(name: string | null): string {
  if (!name) return "?";
  const clean = name.replace(/\s*\[Beneat\]\s*$/, "").trim();
  return clean.charAt(0).toUpperCase();
}

export function AgentIcon({
  name,
  size = 20,
  className = "",
  color,
}: {
  name: string;
  size?: number;
  className?: string;
  /** When provided, shows a monogram circle fallback for agents without icons */
  color?: string;
}) {
  const src = resolveIcon(name);

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={`rounded-full ${className}`}
        aria-hidden="true"
      />
    );
  }

  if (!color) return null;

  const initial = getAgentInitial(name);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.45,
        lineHeight: 1,
        color: "#fff",
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
