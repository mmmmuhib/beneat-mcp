"use client";

interface TraderCardProps {
  walletAddress: string;
  stats: {
    discipline: number;
    patience: number;
    consistency: number;
    timing: number;
    riskControl: number;
    endurance: number;
  };
  overallRating: number;
  tier: "Bronze" | "Silver" | "Gold" | "Diamond" | "Legendary";
  estimatedPreventableLoss: number;
}

interface TierConfig {
  from: string;
  to: string;
  accent: string;
  bgPattern: string;
  shimmer: boolean;
  holo: boolean;
  position: string;
}

const tierConfig: Record<TraderCardProps["tier"], TierConfig> = {
  Bronze: {
    from: "#cd7f32",
    to: "#8b4513",
    accent: "#e8a860",
    bgPattern: "radial-gradient(ellipse at 30% 20%, rgba(205,127,50,0.15) 0%, transparent 60%)",
    shimmer: false,
    holo: false,
    position: "BRZ",
  },
  Silver: {
    from: "#c0c0c0",
    to: "#808080",
    accent: "#d4d4d4",
    bgPattern: "radial-gradient(ellipse at 30% 20%, rgba(192,192,192,0.12) 0%, transparent 60%)",
    shimmer: false,
    holo: false,
    position: "SLV",
  },
  Gold: {
    from: "#ffd700",
    to: "#b8860b",
    accent: "#ffe44d",
    bgPattern:
      "radial-gradient(ellipse at 20% 15%, rgba(255,215,0,0.14) 0%, transparent 50%), " +
      "radial-gradient(ellipse at 80% 80%, rgba(184,134,11,0.1) 0%, transparent 50%)",
    shimmer: false,
    holo: false,
    position: "GLD",
  },
  Diamond: {
    from: "#10b981",
    to: "#059669",
    accent: "#6ee7b7",
    bgPattern:
      "radial-gradient(ellipse at 20% 15%, rgba(16,185,129,0.2) 0%, transparent 50%), " +
      "radial-gradient(ellipse at 80% 80%, rgba(5,150,105,0.15) 0%, transparent 50%)",
    shimmer: true,
    holo: false,
    position: "DMD",
  },
  Legendary: {
    from: "#8b5cf6",
    to: "#6d28d9",
    accent: "#c4b5fd",
    bgPattern:
      "radial-gradient(ellipse at 20% 10%, rgba(139,92,246,0.22) 0%, transparent 45%), " +
      "radial-gradient(ellipse at 80% 85%, rgba(109,40,217,0.18) 0%, transparent 45%), " +
      "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 70%)",
    shimmer: true,
    holo: true,
    position: "LGD",
  },
};

const statEntries: { key: keyof TraderCardProps["stats"]; abbr: string; full: string }[] = [
  { key: "discipline", abbr: "DIS", full: "Discipline" },
  { key: "patience", abbr: "PAT", full: "Patience" },
  { key: "consistency", abbr: "CON", full: "Consistency" },
  { key: "timing", abbr: "TIM", full: "Timing" },
  { key: "riskControl", abbr: "RSK", full: "Risk Control" },
  { key: "endurance", abbr: "END", full: "Endurance" },
];

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatRow({
  value,
  abbr,
  full,
  accent,
}: {
  value: number;
  abbr: string;
  full: string;
  accent: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-1.5 py-0.5"
      title={`${full}: ${value}/99`}
      aria-label={`${full}: ${value} out of 99`}
    >
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
        {abbr}
      </span>
    </div>
  );
}

function SolanaLogo({ size = 14, color }: { size?: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 17.5h13.5l2.5-3H6.5L4 17.5Z" fill={color} />
      <path d="M4 6.5h13.5l2.5 3H6.5L4 6.5Z" fill={color} />
      <path d="M20 12H6.5L4 15h13.5l2.5-3Z" fill={color} opacity={0.7} />
    </svg>
  );
}

export function TraderCard({
  walletAddress,
  stats,
  overallRating,
  tier,
  estimatedPreventableLoss,
}: TraderCardProps) {
  const config = tierConfig[tier];
  const leftStats = statEntries.slice(0, 3);
  const rightStats = statEntries.slice(3);

  return (
    <article
      className="relative w-full max-w-[280px]"
      style={{ aspectRatio: "27/40" }}
      role="region"
      aria-label={`Trader card for wallet ${truncateAddress(walletAddress)}, ${tier} tier with overall rating ${overallRating}`}
    >
      <div
        className="h-full rounded-xl p-[2px]"
        style={{
          background: `linear-gradient(160deg, ${config.from} 0%, ${config.to} 50%, ${config.from}66 100%)`,
        }}
      >
        <div className={`relative h-full overflow-hidden rounded-[10px] bg-card fut-card-shadow ${config.holo ? "fut-holo" : ""}`}>
          <div
            className="absolute inset-0"
            style={{ background: config.bgPattern }}
          />
          <div className="absolute inset-0 fut-card-texture" />
          {config.shimmer && <div className="fut-shimmer-overlay rounded-[10px]" />}

          <div className="relative z-10 flex h-full flex-col p-4">
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-center">
                <span
                  className="text-4xl font-black leading-none tabular-nums"
                  style={{
                    background: `linear-gradient(135deg, ${config.from} 0%, ${config.accent} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                  aria-label={`Overall rating: ${overallRating}`}
                >
                  {overallRating}
                </span>
                <span
                  className="mt-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: config.from }}
                >
                  {config.position}
                </span>
                <SolanaLogo size={12} color={config.from} />
              </div>

              <div
                className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: `linear-gradient(135deg, ${config.from}22 0%, ${config.to}22 100%)`,
                  color: config.from,
                  border: `1px solid ${config.from}44`,
                }}
              >
                {tier}
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${config.from}33 0%, ${config.to}33 100%)`,
                  border: `2px solid ${config.from}88`,
                }}
                aria-hidden="true"
              >
                <svg
                  className="h-9 w-9"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke={config.from}
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                  />
                </svg>
              </div>

              <div
                className="flex w-full items-center justify-center gap-1.5 border-y py-1.5"
                style={{ borderColor: `${config.from}33` }}
              >
                <SolanaLogo size={12} color={config.from} />
                <span className="font-mono text-xs text-white/70">
                  {truncateAddress(walletAddress)}
                </span>
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-x-3"
              role="group"
              aria-label="Trading statistics"
            >
              <div className="flex flex-col">
                {leftStats.map((s) => (
                  <StatRow
                    key={s.key}
                    value={stats[s.key]}
                    abbr={s.abbr}
                    full={s.full}
                    accent={config.accent}
                  />
                ))}
              </div>
              <div
                className="flex flex-col border-l"
                style={{ borderColor: `${config.from}22` }}
              >
                {rightStats.map((s) => (
                  <StatRow
                    key={s.key}
                    value={stats[s.key]}
                    abbr={s.abbr}
                    full={s.full}
                    accent={config.accent}
                  />
                ))}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-1.5">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke={config.from}
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
              <span className="text-[10px] font-medium text-white/50">
                {formatCurrency(estimatedPreventableLoss)} saveable
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
