"use client";

import {
  DocSection,
  DocSubsection,
  CodeBlock,
  DataTable,
  Callout,
  TabGroup,
  Steps,
  Step,
  Accordion,
  InlineCode,
  DocDivider,
  SideNav,
} from "./primitives";

const NAV_ITEMS = [
  { id: "first-calibration", label: "First Calibration" },
  { id: "first-trade", label: "Your First Trade" },
  { id: "integration-tiers", label: "Integration Tiers" },
  { id: "strategy-reference", label: "Strategy & Risk" },
  { id: "calibration-tiers", label: "Calibration Tiers" },
  { id: "session-states", label: "Session States" },
  { id: "coaching-loop", label: "Coaching Loop" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export function McpIntegration() {
  return (
    <div className="relative flex gap-10">
      <div className="hidden w-48 shrink-0 xl:block">
        <SideNav items={NAV_ITEMS} />
      </div>

      <div className="min-w-0 max-w-4xl flex-1 space-y-10">
        {/* First Calibration */}
        <DocSection id="first-calibration" title="Your First Calibration">
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            Calibrate your vault to activate on-chain risk enforcement.
          </p>
          <Steps>
            <Step number={1} title="Check vault status">
              <CodeBlock language="typescript">{`const status = await callTool("beneat_get_status", {
  wallet_address: "YOUR_WALLET",
});
// → { vault_exists: false, can_trade: true, ... }`}</CodeBlock>
              <p>No vault yet — the agent is in advisory mode.</p>
            </Step>
            <Step number={2} title="Calibrate risk rules">
              <CodeBlock language="typescript">{`const cal = await callTool("beneat_calibrate", {
  wallet_address: "YOUR_WALLET",
  deposit_amount: 5,
  strategy_type: "day_trading",
  risk_tolerance: "medium",
});
// → { calibration: { tier: 1 }, parameters: { daily_loss_limit_sol: 0.15 }, unsigned_transactions: [...] }`}</CodeBlock>
              <p>
                Returns Tier 1 parameters: 0.15 SOL daily loss limit, 20
                trades/day, 120s cooldown, 12h lockout.
              </p>
            </Step>
            <Step number={3} title="Sign and submit transactions">
              <CodeBlock language="typescript">{`for (const tx of cal.unsigned_transactions) {
  // tx.transaction is a base64 VersionedTransaction
  // tx.description: "Initialize vault", "Set rules", etc.
  const decoded = VersionedTransaction.deserialize(
    Buffer.from(tx.transaction, "base64")
  );
  decoded.sign([walletKeypair]);
  await connection.sendTransaction(decoded);
}`}</CodeBlock>
              <p>The MCP server never touches private keys.</p>
            </Step>
            <Step number={4} title="Verify the vault is active">
              <CodeBlock language="typescript">{`const status = await callTool("beneat_get_status", {
  wallet_address: "YOUR_WALLET",
});
// → { vault_exists: true, can_trade: true, daily_loss_limit_sol: 0.15 }`}</CodeBlock>
            </Step>
          </Steps>
        </DocSection>

        <DocDivider />

        {/* Your First Trade */}
        <DocSection id="first-trade" title="Your First Trade">
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            3 tool calls per trade cycle:
          </p>
          <Steps>
            <Step number={1} title="Pre-flight check">
              <CodeBlock language="typescript">{`const check = await callTool("beneat_check_trade", {
  wallet_address: "YOUR_WALLET",
  market: "SOL-PERP",
  size: 0.1,
  direction: "long",
});

if (!check.approved) {
  console.log("Trade denied:", check.reasons);
  return;
}`}</CodeBlock>
            </Step>
            <Step number={2} title="Execute the trade">
              <p>
                Use your existing trading logic — Jupiter swap, Drift perp,
                Raydium, whatever. Beneat is protocol-agnostic.
              </p>
            </Step>
            <Step number={3} title="Record the result">
              <CodeBlock language="typescript">{`const result = await callTool("beneat_record_trade", {
  wallet_address: "YOUR_WALLET",
  pnl: -0.02,       // SOL — negative = loss
  market: "SOL-PERP",
  confidence: 0.75,  // optional (0-1)
});

if (result.lockout_triggered) {
  console.log("LOCKOUT:", result.lockout_reason);
  // Stop all trading — wallet is frozen if AgentWallet is configured
}`}</CodeBlock>
            </Step>
          </Steps>
        </DocSection>

        <DocDivider />

        {/* Integration Tiers */}
        <DocSection id="integration-tiers" title="Integration Tiers">
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            Start minimal, upgrade as needed.
          </p>
          <TabGroup
            tabs={[
              {
                label: "Minimal",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      3 calls. Risk enforcement only.
                    </p>
                    <CodeBlock title="3-call integration">{`beneat_check_trade → approved? → execute trade → beneat_record_trade → lockout?`}</CodeBlock>
                  </>
                ),
              },
              {
                label: "Standard",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      One-time calibration + ongoing enforcement.
                    </p>
                    <CodeBlock title="Calibrate + Enforce">{`Setup:   beneat_calibrate → sign unsigned TXs
Loop:    check_trade → execute → record_trade
Periodic: beneat_recalibrate + beneat_get_analytics`}</CodeBlock>
                  </>
                ),
              },
              {
                label: "Full Coaching",
                content: (
                  <>
                    <p className="mb-3 text-xs text-[var(--text-secondary)]">
                      Session-aware trading with confidence calibration.
                    </p>
                    <CodeBlock title="Session-aware coaching">{`Start:  get_session_strategy → mode, limits, focus markets
Loop:   check_trade(include_coaching=true)
        calibrate_confidence → adjusted size
        execute → record_trade(pnl, confidence)
End:    get_playbook(enforce=true) + get_analytics`}</CodeBlock>
                  </>
                ),
              },
            ]}
          />
        </DocSection>

        <DocDivider />

        {/* Strategy & Risk Tolerance Reference */}
        <DocSection id="strategy-reference" title="Strategy & Risk Tolerance">
          <DocSubsection title="Strategy Types">
            <DataTable
              headers={["Strategy", "Max Trades/Day", "Cooldown", "Best For"]}
              rows={[
                ["scalping", "50", "30s", "High-frequency micro-trades"],
                ["day_trading", "20", "120s", "Intraday positions"],
                ["swing_trading", "5", "600s", "Multi-hour/multi-day positions"],
                ["conservative", "3", "1800s", "Capital preservation focus"],
              ]}
            />
          </DocSubsection>
          <DocSubsection title="Risk Tolerances">
            <DataTable
              headers={["Level", "Daily Loss %", "Lockout Duration", "Best For"]}
              rows={[
                ["low", "1%", "24 hours", "New agents, capital preservation"],
                ["medium", "3%", "12 hours", "Balanced risk/reward"],
                ["high", "5%", "6 hours", "Experienced agents with edge"],
                ["degen", "10%", "2 hours", "High-conviction strategies"],
              ]}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Loss % is relative to deposit. Example: <InlineCode>medium</InlineCode> + 5 SOL = 0.15 SOL/day limit.
            </p>
          </DocSubsection>
        </DocSection>

        <DocDivider />

        {/* Calibration Tiers */}
        <DocSection id="calibration-tiers" title="Calibration Tiers">
          <Callout type="info">
            Tiers auto-upgrade as trades accumulate. No manual selection.
          </Callout>
          <DataTable
            headers={["Tier", "Trade Count", "Method", "What It Does"]}
            rows={[
              [
                "Tier 1",
                "0\u20134 trades",
                "Capital-based",
                "Derives rules from deposit amount, strategy type, and risk tolerance",
              ],
              [
                "Tier 2",
                "5\u201319 trades",
                "Behavioral",
                "Adjusts based on win rate, loss streak frequency, and revenge trading ratio",
              ],
              [
                "Tier 3",
                "20+ trades",
                "Quantitative",
                "VaR at 95%, Sharpe ratio, Kelly fraction, profit factor, max drawdown",
              ],
            ]}
          />
        </DocSection>

        <DocDivider />

        {/* Session State Machine */}
        <DocSection id="session-states" title="Session State Machine">
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            Agent state is classified in priority order (top wins):
          </p>
          <DataTable
            headers={["State", "Trigger", "Size Multiplier", "Description"]}
            rows={[
              [
                "post_lockout_recovery",
                "Recently unlocked from lockout",
                <span key="0.33" className="font-mono text-[var(--loss-red)]">0.33x</span>,
                "Most conservative \u2014 rebuild confidence first",
              ],
              [
                "tilt",
                "3+ consecutive losses in session",
                <span key="0.25" className="font-mono text-[var(--loss-red)]">0.25x</span>,
                "Aggressive reduction \u2014 agent reasoning degraded",
              ],
              [
                "post_loss",
                "Last trade was a loss within 5 min",
                <span key="0.5" className="font-mono text-[var(--accent-amber)]">0.5x</span>,
                "Reduce exposure after recent loss",
              ],
              [
                "hot_streak",
                "3+ consecutive wins in session",
                <span key="0.8" className="font-mono text-[var(--accent-cyan)]">0.8x</span>,
                "Slight reduction \u2014 prevents overconfidence",
              ],
              [
                "normal",
                "Default",
                <span key="1.0" className="font-mono text-[var(--profit-green)]">1.0x</span>,
                "Standard operating conditions",
              ],
            ]}
          />
          <Callout type="tip">
            Most protective state wins. Post-lockout + tilting = <InlineCode>post_lockout_recovery</InlineCode> (0.33x), not <InlineCode>tilt</InlineCode> (0.25x).
          </Callout>
        </DocSection>

        <DocDivider />

        {/* Coaching Loop */}
        <DocSection id="coaching-loop" title="The Coaching Loop">
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            Full coaching session lifecycle:
          </p>
          <Steps>
            <Step number={1} title="Get session strategy">
              <p>
                Beneat evaluates agent state (recovery, tilt, normal) and returns mode, trade limits, and focus markets.
              </p>
            </Step>
            <Step number={2} title="Pre-trade check">
              <p>
                Returns approval + coaching context: mode, suggested size, markets to avoid.
              </p>
            </Step>
            <Step number={3} title="Confidence calibration">
              <p>
                Agent reports confidence (0–1). Beneat compares to historical accuracy and adjusts position size accordingly.
              </p>
            </Step>
            <Step number={4} title="Record result">
              <p>
                Log P&L and confidence. Feeds back into calibration.
              </p>
            </Step>
            <Step number={5} title="Playbook evolves">
              <p>
                Losing markets get restricted. Position sizing adjusts based on real performance. Behavioral rules accumulate.
              </p>
            </Step>
            <Step number={6} title="Lockout &amp; recovery">
              <p>
                On limit breach: automatic lockout + wallet freeze. On expiry: recovery mode (0.33x size) until trust rebuilds.
              </p>
            </Step>
          </Steps>
          <Callout type="tip">
            Goal: fewer lockouts over time. The coaching system teaches agents to stay within limits, not hit them.
          </Callout>
        </DocSection>

        <DocDivider />

        {/* Troubleshooting */}
        <DocSection id="troubleshooting" title="Troubleshooting">
          <div className="space-y-2">
            <Accordion title="Coaching context is empty">
              <p>
                Set <InlineCode>HELIUS_API_KEY</InlineCode>. Coaching requires on-chain trade history.
              </p>
            </Accordion>
            <Accordion title="Insufficient confidence data">
              <p>
                Need 3+ trades per confidence bin. Record trades with the <InlineCode>confidence</InlineCode> param (0–1).
              </p>
            </Accordion>
          </div>
        </DocSection>
      </div>
    </div>
  );
}
