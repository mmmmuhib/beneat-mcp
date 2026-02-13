# Beneat — Protect Your Capital, Improve Your Agent

## What Is Beneat?

Beneat is a safety layer that sits between your money and your AI trading agent. It enforces risk rules that the agent cannot override, tracks performance to detect when the agent is making bad decisions, and actively coaches the agent to trade better over time.

It is not a trading bot. It does not execute trades. It watches, limits, and teaches.

When your agent hits its daily loss limit, Beneat freezes its wallet. When your agent is on a losing streak, Beneat reduces its position sizes. When your agent keeps losing on a specific market, Beneat tells it to stop trading there. When your agent says it's 80% confident but history shows it's only 55% accurate at that level, Beneat adjusts its sizing accordingly.

All of this happens automatically through 15 MCP tools that any AI agent can use.

---

## Why You Need It

AI trading agents fail in the same ways human traders do — just for different reasons:

| Human Trader | AI Agent | What Happens |
|---|---|---|
| Fear — sells too early | Hallucinated risk — exits good position | Missed gains |
| Greed — holds too long | Overconfident thesis — refuses to exit | Drawdown |
| Revenge trades after a loss | Repeats failed strategy with new rationalization | Accelerated losses |
| Tilt — reckless sizing after losses | Context degradation — loses track of P&L | Account blown |

In both cases, the trader believes they're making a rational decision. Beneat removes that risk by enforcing rules externally — on-chain and at the wallet level.

**Three layers of protection:**

1. **On-chain vault** — Risk rules are stored in a Solana program. The vault program rejects rule-violating transactions with `require!()` guards.
2. **Wallet freeze** — When limits are breached, Beneat sets AgentWallet's `max_per_tx_usd` to 0. The agent literally cannot sign transactions.
3. **Coaching** — Before enforcement kicks in, the coaching system helps the agent stay within limits by adjusting position sizes, flagging bad markets, and calibrating confidence.

---

## Getting Started

### 1. Set Up AgentWallet

AgentWallet gives Beneat the power to freeze your agent's spending. This is optional but recommended — without it, enforcement is advisory only.

```bash
# Start connection
curl -X POST https://agentwallet.mcpay.tech/api/connect/start \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com"}'

# Complete with OTP from email
curl -X POST https://agentwallet.mcpay.tech/api/connect/complete \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","email":"your@email.com","otp":"123456"}'
```

Save the credentials:

```json
// ~/.agentwallet/config.json
{
  "apiToken": "mf_...",
  "username": "YOUR_USERNAME"
}
```

### 2. Add Beneat to Your Agent

Add this to your agent's MCP configuration:

```json
{
  "mcpServers": {
    "beneat-risk": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "HELIUS_API_KEY": "your-helius-key"
      }
    }
  }
}
```

This works with Claude, GPT, open-source agents, and any framework that supports MCP.

### 3. Calibrate Risk Rules

Tell your agent to run:

```
beneat_calibrate(wallet, deposit=5, strategy="day_trading", risk="medium")
```

This creates an on-chain vault with risk rules tailored to your strategy:

| Strategy | What It Means |
|----------|--------------|
| **Scalping** | High frequency (up to 50 trades/day), 30s cooldown between trades |
| **Day Trading** | Moderate frequency (up to 20 trades/day), 2min cooldown |
| **Swing Trading** | Low frequency (up to 5 trades/day), 10min cooldown |
| **Conservative** | Minimal trading (up to 3 trades/day), 30min cooldown |

| Risk Tolerance | What It Means |
|---------------|--------------|
| **Low** | Can lose up to 1% of capital/day, 24h lockout if breached |
| **Medium** | Can lose up to 3% of capital/day, 12h lockout if breached |
| **High** | Can lose up to 5% of capital/day, 6h lockout if breached |
| **Degen** | Can lose up to 10% of capital/day, 2h lockout if breached |

The calibrate tool returns unsigned transactions — your agent signs and submits them to activate the rules.

---

## Features

### Risk Enforcement

**Daily loss limits** — Your agent can't lose more than X SOL per day. When the limit is hit, the vault locks and the wallet freezes.

**Trade frequency caps** — Prevents overtrading. A day trading agent gets 20 trades per day. After that, it's done until tomorrow.

**Cooldown periods** — Forced pause after losses. Your agent must wait before trading again. This prevents the "revenge trade" pattern where agents immediately re-enter after a loss.

**Lockouts** — When limits are breached, your agent is locked out for a set duration. During lockout, it cannot execute any transactions.

### Agent Coaching

**Session awareness** — Beneat knows when your agent is tilting (3+ consecutive losses), recovering from a lockout, or on a hot streak. It adjusts position sizing recommendations automatically:

| Agent State | What Happens |
|-------------|-------------|
| Normal | Full position sizes allowed |
| Just lost a trade | Sizes reduced by 50% |
| 3+ losses in a row (tilt) | Sizes reduced by 75% |
| On a win streak | Sizes slightly reduced (prevents overconfidence) |
| Recovering from lockout | Sizes reduced by 67% |

**Confidence calibration** — Your agent reports how confident it is (0-100%) on each trade. Beneat tracks whether high-confidence trades actually win more often. If your agent says "80% confident" but only wins 55% of those trades, Beneat calibrates it down and reduces sizing.

**Trading playbook** — An evolving set of rules that get smarter over time:
- Which markets your agent wins on (and which it should avoid)
- How much it should risk per trade (Kelly criterion, capped conservatively)
- Behavioral rules generated from detected patterns (revenge trading prevention, tilt recovery, overconfidence guards)
- Market regime detection — flags when conditions change

**Market recommendations** — Tells your agent where it actually has edge. "You win 64% on Jupiter swaps but only 28% on Drift perps. Stay on Jupiter."

### Analytics

**Hallucination rate** — How often your agent's analysis is wrong, weighted by trade size. A 60% hallucination rate means the agent is wrong more often than right.

**Signal accuracy by market** — Per-market win rates. See exactly where your agent succeeds and fails.

**Overconfidence index** — Does your agent size up on trades it loses? If large trades have lower win rates than small trades, your agent is most confident when it's most wrong.

**Tilt detection** — How much does performance drop after consecutive losses? If win rate falls from 52% to 20% after a loss streak, the agent's reasoning is degraded.

**Revenge trading detection** — Trades within 2 minutes of a loss. These are the most dangerous decisions.

**Trend analysis** — Is your agent getting better or worse over time?

**Directives** — Machine-readable action items your agent can follow: avoid a market, reduce position size, increase cooldown, or pause trading entirely.

### Agent Verification & Leaderboard

**Trust scores** — Check any agent's on-chain reputation (0-100 score, A-F grade). Based entirely on on-chain data: vault existence, trade history, win rate, discipline, lockout compliance.

**Leaderboard** — Compare agents by performance, discipline, and trust score. Sortable by rating, win rate, trades, or discipline.

### Emergency Controls

**Instant freeze** — Shut down your agent's trading immediately:

```
beneat_set_policy(wallet, action="freeze")
```

The wallet policy is set to `max_per_tx_usd: 0`. Your agent cannot sign any transaction.

**Restore** — Resume after investigation:

```
beneat_set_policy(wallet, action="restore")
```

---

## How the Tools Work

### Before Trading

| Tool | What It Does |
|------|-------------|
| `beneat_calibrate` | Set up risk rules from your strategy and risk tolerance. Returns transactions to sign |
| `beneat_get_session_strategy` | Get a plan for this trading session: mode, trade limits, focus markets, stop conditions |
| `beneat_check_trade` | Pre-flight check: can you trade right now? Includes coaching recommendations |
| `beneat_calibrate_confidence` | Check if your agent's confidence matches reality. Get calibrated position size |

### During Trading

| Tool | What It Does |
|------|-------------|
| `beneat_record_trade` | Log trade result and confidence. Checks if you've hit your loss limit |
| `beneat_health_check` | Check portfolio health, Drift positions, unrealized P&L warnings |

### After Trading

| Tool | What It Does |
|------|-------------|
| `beneat_get_playbook` | Get your agent's evolving playbook: identity, markets, rules, regime |
| `beneat_get_analytics` | Full performance analysis: hallucination rate, tilt, revenge trading, directives |
| `beneat_recalibrate` | Update risk rules based on latest performance |

### Monitoring

| Tool | What It Does |
|------|-------------|
| `beneat_get_status` | Current vault state: lockout, cooldown, trade count, budget |
| `beneat_get_profile` | On-chain reputation: ratings, win rate, discipline scores |
| `beneat_verify_agent` | Trust score and grade for any agent |
| `beneat_get_leaderboard` | Ranked list of all agents by performance |

### Emergency

| Tool | What It Does |
|------|-------------|
| `beneat_set_policy` | Freeze/restore/sync wallet spending policy |
| `beneat_cancel_swap` | Diagnose stuck swap state |

---

## The Coaching Loop

Here's what a full coaching session looks like:

**1. Start your session**
Your agent asks Beneat for a session strategy. Beneat looks at the agent's current state (is it recovering from a lockout? tilting?) and sets the mode.

**2. Before each trade**
Your agent checks if it's allowed to trade. Beneat returns approval plus coaching: "You're in recovery mode, keep positions small. Avoid Drift. Focus on Jupiter."

**3. Confidence check**
Your agent reports how confident it is. Beneat compares this to historical accuracy: "You say 80% but you only win 55% at this confidence level. Here's a smaller position size."

**4. After each trade**
Your agent records the result with its confidence level. This data feeds back into the calibration system.

**5. Over time**
Your agent's playbook evolves. Markets where it loses get restricted. Behavioral rules accumulate. Position sizing tightens or loosens based on real performance.

**6. If things go wrong**
Lockout triggers automatically. Wallet freezes. When the lockout expires, the session strategy starts in `conservative_recovery` mode — rebuilding trust before going back to full size.

The goal is simple: **fewer lockouts over time, not more.** The coaching system teaches the agent to stay within its limits rather than hitting them.

---

## FAQ

**Can the agent bypass Beneat?**
No. Enforcement is dual-layer. The on-chain vault program rejects rule-violating transactions with `require!()` guards. AgentWallet policy freeze prevents the agent from signing any transaction. An agent would need to circumvent both to break the rules.

**What if I don't have AgentWallet?**
Tools run in advisory mode. They return approval/denial JSON and coaching data, but cannot freeze the wallet. The on-chain vault still enforces rules at the program level.

**Does Beneat hold my private keys?**
No. All write operations return unsigned base64 transactions. You (or your agent) sign and submit them. The MCP server never touches private keys.

**What protocols does it support?**
Any trading protocol on Solana. Beneat detects the protocol from on-chain transaction history via Helius: Jupiter, Drift, Raydium, Orca, Phoenix, Meteora, Flash Trade, Lifinity, OpenBook, Sanctum, Kamino, MarginFi, Zeta, Mango, Pump.fun, Tensor, and more.

**Is my P&L public?**
No. Vault lockout status is public (on-chain), but P&L details stay private via Light Protocol's ZK compression. Other agents can see that you have a vault and a trust score, but not your actual trading results.

**How does Beneat get smarter over time?**
Three mechanisms: (1) Calibration tiers automatically upgrade from capital-based (Tier 1) to behavioral (Tier 2) to quantitative (Tier 3) as more trades accumulate. (2) The playbook evolves each time it's called. (3) Confidence calibration improves as more trades are recorded with confidence values.

**What happens if the server restarts?**
The session store (in-memory trade tracking) resets. On-chain data (vault, profile, history) is unaffected. A new session starts automatically.
