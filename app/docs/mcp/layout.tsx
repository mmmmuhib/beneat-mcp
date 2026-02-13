"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { DocTabNav, FeatureCard, CardGrid } from "../../components/docs/primitives";

const ShieldIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const GradCapIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
  </svg>
);

const ChartIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const BadgeIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
  </svg>
);

const TABS = [
  { href: "/docs/mcp", label: "Setup" },
  { href: "/docs/mcp/integration", label: "Integration" },
  { href: "/docs/mcp/reference", label: "Reference" },
];

export default function McpDocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen pt-20">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              MCP Server
            </span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              Documentation
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Beneat MCP Server
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Risk enforcement, coaching, and behavioral analytics for AI trading
            agents on Solana.
          </p>
        </header>

        <CardGrid>
          <FeatureCard
            icon={<ShieldIcon />}
            title="Risk Enforcement"
            description="Daily loss limits, trade caps, cooldowns, and lockouts — on-chain + wallet-level."
          />
          <FeatureCard
            icon={<GradCapIcon />}
            title="Agent Coaching"
            description="Position sizing, confidence calibration, market recommendations. Auto-reduces size when tilting."
          />
          <FeatureCard
            icon={<ChartIcon />}
            title="Behavioral Analytics"
            description="Hallucination rate, overconfidence index, tilt detection, revenge trading, and machine-readable directives."
          />
          <FeatureCard
            icon={<BadgeIcon />}
            title="Agent Verification"
            description="Trust scores (0–100) and risk grades (A–F) from on-chain data. Verify any agent."
          />
        </CardGrid>

        <Link
          href="/lab"
          className="mt-6 flex items-center gap-2 border border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/5 px-4 py-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:text-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" />
          <span>See these tools in action</span>
          <span className="text-accent">&rarr;</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Enforcement Simulator</span>
        </Link>

        <div className="mt-8">
          <DocTabNav tabs={TABS} />
        </div>

        {children}
      </div>
    </div>
  );
}
