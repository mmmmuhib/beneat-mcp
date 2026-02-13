"use client";

import {
  DocSection,
  DocSubsection,
  CodeBlock,
  DataTable,
  Callout,
  Accordion,
  InlineCode,
  DocDivider,
  SideNav,
} from "./primitives";

const NAV_ITEMS = [
  { id: "tool-reference", label: "Tool Reference" },
  { id: "demo", label: "Demo" },
  { id: "design-principles", label: "Design Principles" },
  { id: "programs", label: "Devnet Programs" },
];

export function McpReference() {
  return (
    <div className="relative flex gap-10">
      <div className="hidden w-48 shrink-0 xl:block">
        <SideNav items={NAV_ITEMS} />
      </div>

      <div className="min-w-0 max-w-4xl flex-1 space-y-10">
        {/* Tool Quick Reference */}
        <DocSection id="tool-reference" title="Tool Quick Reference">
          <DocSubsection title="Observation">
            <DataTable
              compact
              headers={["Tool", "Purpose", "Key Input"]}
              rows={[
                ["beneat_get_status", "Vault lockout state, cooldown, trade budget, can_trade flag", "wallet_address"],
                ["beneat_get_profile", "On-chain reputation scores, win rate, trading history", "wallet_address"],
                ["beneat_verify_agent", "Trust score (0\u2013100), risk grade (A\u2013F)", "wallet_address"],
                ["beneat_health_check", "Portfolio health: Drift positions, unrealized P&L, warnings", "wallet_address"],
                ["beneat_cancel_swap", "Diagnose stuck swap_in_progress state", "wallet_address"],
                ["beneat_get_leaderboard", "Ranked agents by trust/discipline/win_rate/trades", "limit, sort_by"],
              ]}
            />
          </DocSubsection>
          <DocSubsection title="Risk Enforcement">
            <DataTable
              compact
              headers={["Tool", "Purpose", "Key Input"]}
              rows={[
                ["beneat_check_trade", "Pre-flight check with optional coaching context", "wallet_address, market, size, direction, leverage, include_coaching"],
                ["beneat_record_trade", "Log trade P&L, check loss limits, trigger lockout", "wallet_address, pnl, market, confidence"],
                ["beneat_set_policy", "Freeze/restore/sync/status on AgentWallet policy", "wallet_address, action"],
              ]}
            />
          </DocSubsection>
          <DocSubsection title="Calibration">
            <DataTable
              compact
              headers={["Tool", "Purpose", "Key Input"]}
              rows={[
                ["beneat_calibrate", "Auto-calibrate risk params from history \u2192 unsigned TXs", "wallet_address, deposit_amount, strategy_type, risk_tolerance, lookback_days"],
                ["beneat_recalibrate", "Re-run calibration with defaults", "wallet_address"],
              ]}
            />
          </DocSubsection>
          <DocSubsection title="Agent Improvement">
            <DataTable
              compact
              headers={["Tool", "Purpose", "Key Input"]}
              rows={[
                ["beneat_get_analytics", "Behavioral metrics + machine-readable directives[]", "wallet_address, lookback_days"],
                ["beneat_get_playbook", "Personalized playbook: identity, markets, Kelly sizing, behavioral rules, regime", "wallet_address, lookback_days, enforce"],
                ["beneat_calibrate_confidence", "Map confidence (0\u20131) to historical accuracy + position size", "wallet_address, confidence"],
                ["beneat_get_session_strategy", "Session mode/limits/focus based on current state", "wallet_address, lookback_days, enforce"],
              ]}
            />
          </DocSubsection>
          <DocSubsection title="Registration">
            <DataTable
              compact
              headers={["Tool", "Purpose", "Key Input"]}
              rows={[
                ["beneat_register_agent", "Self-register on the Beneat leaderboard", "wallet_address"],
              ]}
            />
          </DocSubsection>
        </DocSection>

        <DocDivider />

        {/* Demo */}
        <DocSection id="demo" title="Demo Lifecycle">
          <Accordion title="Run the full enforcement demo" defaultOpen>
            <CodeBlock language="bash">{`npm run demo`}</CodeBlock>
            <p className="mb-3">
              11-step lifecycle:
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li><strong>Status check</strong> — no vault exists yet (advisory mode)</li>
              <li><strong>Calibration</strong> — Tier 1 rules: day_trading, medium risk, 1 SOL</li>
              <li><strong>Pre-trade check</strong> — approved, agent proceeds</li>
              <li className="text-[var(--profit-green)]"><strong>Record win</strong> — +0.02 SOL profit, session healthy</li>
              <li><strong>Record loss</strong> — -0.008 SOL, cooldown warning</li>
              <li><strong>Record loss</strong> — -0.01 SOL, approaching budget limit</li>
              <li><strong>Record loss</strong> — -0.015 SOL, warnings escalate</li>
              <li className="text-[var(--loss-red)]"><strong>Big loss</strong> — -0.025 SOL, daily limit breached, LOCKOUT + WALLET FROZEN</li>
              <li className="text-[var(--loss-red)]"><strong>Pre-trade check</strong> — DENIED, agent locked out</li>
              <li><strong>Policy status</strong> — confirms wallet is frozen</li>
              <li><strong>Verify agent</strong> — trust score reflects discipline</li>
            </ol>
            <p className="mt-3 text-[var(--text-muted)]">
              Every call is a real MCP tool invocation over stdio.
            </p>
          </Accordion>
        </DocSection>

        <DocDivider />

        {/* Design Principles */}
        <DocSection id="design-principles" title="Key Design Principles">
          <ul className="space-y-3">
            <li className="border-l-2 border-[var(--border-color)] pl-4">
              <strong className="text-[var(--text-primary)]">Unsigned transactions</strong>
              <span className="ml-1">— Server never holds keys. Returns base64 VersionedTransactions for caller to sign.</span>
            </li>
            <li className="border-l-2 border-[var(--border-color)] pl-4">
              <strong className="text-[var(--text-primary)]">Dual enforcement</strong>
              <span className="ml-1">— On-chain vault <InlineCode>require!()</InlineCode> + AgentWallet freeze. Must bypass both to break rules.</span>
            </li>
            <li className="border-l-2 border-[var(--border-color)] pl-4">
              <strong className="text-[var(--text-primary)]">In-memory sessions</strong>
              <span className="ml-1">— Sessions reset on restart. On-chain data is permanent.</span>
            </li>
            <li className="border-l-2 border-[var(--border-color)] pl-4">
              <strong className="text-[var(--text-primary)]">Protocol-agnostic</strong>
              <span className="ml-1">— 20+ DeFi protocols via Helius: Jupiter, Drift, Raydium, Orca, Phoenix, Meteora, and more.</span>
            </li>
            <li className="border-l-2 border-[var(--border-color)] pl-4">
              <strong className="text-[var(--text-primary)]">Advisory mode</strong>
              <span className="ml-1">— Works without vault or AgentWallet. Use <InlineCode>enforce</InlineCode> flag to write rules on-chain.</span>
            </li>
          </ul>
          <Callout type="warning">
            Session store is in-memory. Server restart = session lost. On-chain state is permanent.
          </Callout>
        </DocSection>

        <DocDivider />

        {/* Devnet Programs */}
        <DocSection id="programs" title="Devnet Programs">
          <DataTable
            headers={["Program", "Address"]}
            rows={[
              ["Vault", "GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki"],
              ["Ghost Crank", "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv"],
              ["Ghost Bridge", "8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA"],
              ["Drift", "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"],
            ]}
          />
        </DocSection>
      </div>
    </div>
  );
}
