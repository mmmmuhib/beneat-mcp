# Beneat — Risk Intelligence for AI Trading Agents on Solana

AI trading agents hallucinate. They generate confident analysis for bad trades, repeat failed strategies with new rationalizations, and lose track of cumulative P&L across long sessions. This is structurally the same problem as emotional trading in humans — and it needs the same solution: externalized risk enforcement that the trader cannot override.

Beneat is an MCP server that sits between capital and execution. It protects users who delegate trading to AI agents, and it gives agent teams the analytics to build better models. Auto-calibrated risk limits from on-chain history. Hallucination diagnostics across markets and protocols. Wallet-level enforcement that can't be bypassed. On-chain reputation scores for agent-to-agent trust.

When an agent hits its daily loss limit, Beneat sets `max_per_tx_usd` to `"0"` on its AgentWallet policy. The agent cannot sign another transaction until the lockout expires. No override. No negotiation. The rules are on-chain and the enforcement is at the wallet.

## Who It's For

**If you use a trading agent** — Beneat protects your capital. You set your risk tolerance, and the agent literally cannot exceed it. Your daily loss limit, trade frequency cap, and lockout duration are enforced on-chain and at the wallet level. If the agent hallucinates a bad trade thesis at 3am, the guardrails hold. You can check any agent's on-chain trust score before deploying it, and hit an emergency freeze if anything looks wrong.

**If you build a trading agent** — Beneat tells you where your agent hallucinates. Hallucination rate per market and protocol. Overconfidence index. Tilt detection after loss streaks. Revenge hallucination rate. Actionable recommendations for which markets to restrict and what behavioral patterns to fix. Plug it in, read the analytics, fix the model, recalibrate — Beneat keeps the agent safe while you iterate.

**If you want to see how agents compare** — The public leaderboard at `/leaderboard` ranks all Beneat-verified agents by performance, discipline, and trust score. Click any agent to see their full trading stats, risk configuration, and lockout history. Other hackathon teams can plug in Beneat to appear on the leaderboard, creating adoption pressure.

All three audiences use the same MCP server and the same 19 tools (18 core + 1 semantic router).

## Why This Exists

Human traders have emotions. AI agents have hallucinations. The failure modes are different but the outcomes are identical:

| Human Trader | AI Agent | Outcome |
|---|---|---|
| Fear — sells too early | Hallucinated risk — exits good position | Missed gains |
| Greed — holds too long | Overconfident thesis — refuses to exit | Drawdown |
| Revenge trades after a loss | Repeats failed strategy with new rationalization | Accelerated losses |
| Tilt — reckless sizing | Context degradation — loses track of P&L | Account blown |

In both cases, the trader believes they're making a rational decision. The emotional trader feels like they're analyzing. The hallucinating agent generates plausible reasoning. Neither one knows they're wrong.

The solution is the same: don't trust the trader to self-regulate. Put the guardrails somewhere they can't be overridden — on-chain, at the wallet level, enforced by math instead of willpower.

## Quick Start

### 1. Configure AgentWallet

Beneat enforces risk rules by controlling your [AgentWallet](https://agentwallet.mcpay.tech) spending policy. Set up AgentWallet first:

```bash
curl -X POST https://agentwallet.mcpay.tech/api/connect/start \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com"}'

curl -X POST https://agentwallet.mcpay.tech/api/connect/complete \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","email":"your@email.com","otp":"123456"}'
```

Save the returned credentials:

```json
// ~/.agentwallet/config.json
{
  "apiToken": "mf_...",
  "username": "YOUR_USERNAME"
}
```

### 2. Add MCP Server

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

Any agent framework that supports MCP — Claude, GPT, open-source agents, custom bots — can plug in Beneat with this config.

## How Enforcement Works

Beneat operates in two enforcement modes:

**With AgentWallet (full enforcement):** When `~/.agentwallet/config.json` is present, Beneat dynamically controls the agent's spending policy. When a lockout is triggered, `max_per_tx_usd` is set to `"0"` — AgentWallet refuses to sign any transaction. The agent literally cannot trade until the lockout expires and Beneat restores the policy.

**Without AgentWallet (advisory mode):** Tools return approval/denial JSON responses. Enforcement depends on the agent respecting the recommendations and on-chain vault `require!()` guards.

```
Agent calibrates → Beneat sets vault rules + syncs AgentWallet policy
Agent calls check_trade → Beneat approves/denies + checks lockout expiry
Agent records trade → Beneat tracks PnL → if limit breached:
  |-- Triggers on-chain vault lockout
  +-- Freezes AgentWallet policy (max_per_tx_usd = 0)
      -> Agent CANNOT sign transactions
      -> Lockout expires -> check_trade auto-restores policy
```

Enforcement is dual-layer by design. The on-chain vault program's `require!()` guards reject rule-violating transactions even if the agent bypasses the MCP layer. AgentWallet policy control adds a second enforcement point at the wallet itself. An agent would need to circumvent both to break the rules.

## Tools

### Read-Only

| Tool | Description |
|------|-------------|
| `beneat_get_status` | Vault state: lockout, cooldown, trade budget, can_trade flag |
| `beneat_get_profile` | On-chain trader profile: ratings (0-99), win rate, PnL history |
| `beneat_get_analytics` | Hallucination rate, signal accuracy by market/protocol, overconfidence index, tilt detection, revenge hallucination rate, trend analysis, recommendations, and machine-readable `directives[]` for programmatic consumption |
| `beneat_verify_agent` | Trust score (0-100) and risk grade (A-F) from on-chain data |
| `beneat_check_trade` | Pre-flight: can this agent trade? Checks all limits, includes coaching context (session state, sizing, market recommendations). Auto-restores AgentWallet policy when lockout expires |
| `beneat_health_check` | Vault + session health, Drift positions (when available), unrealized PnL warnings |
| `beneat_cancel_swap` | Diagnose stuck swap_in_progress state |
| `beneat_get_leaderboard` | Ranked leaderboard of all Beneat-verified agents: trust grades, ratings, win rates, P&L, discipline, lockout history. Sortable by rating, win_rate, trades, or discipline |

### Write (returns unsigned base64 transactions)

| Tool | Description |
|------|-------------|
| `beneat_calibrate` | Auto-calibrate risk params from history. Returns unsigned txs. Auto-syncs AgentWallet policy |
| `beneat_recalibrate` | Re-run calibration with latest on-chain data |
| `beneat_record_trade` | Record trade PnL with optional confidence (0-1) for calibration. Auto-freezes AgentWallet if daily loss limit breached |

### AgentWallet Policy Management

| Tool | Description |
|------|-------------|
| `beneat_set_policy` | Manage AgentWallet spending policy: `freeze`, `restore`, `sync`, or `status` |

#### beneat_set_policy Actions

| Action | Effect |
|--------|--------|
| `freeze` | Set `max_per_tx_usd` to 0 — blocks all transactions |
| `restore` | Restore pre-freeze spending limits |
| `sync` | Derive AgentWallet limits from vault risk rules (daily_loss_limit / max_trades = per-tx cap) |
| `status` | View current AgentWallet policy and frozen state |

### Agent Coaching & Improvement

| Tool | Description |
|------|-------------|
| `beneat_get_playbook` | Personalized trading playbook: agent identity classification, primary/restricted markets with edge ratings, Kelly-based position sizing with state reductions, behavioral rules from tilt/revenge/overconfidence detection, market regime analysis. Use `enforce=true` to write playbook-derived rules on-chain |
| `beneat_calibrate_confidence` | Calibrate agent confidence against historical accuracy. Bins confidence into 5 ranges, maps to actual win rate per bin, returns calibrated confidence and position size recommendation. Requires trades recorded with confidence via `beneat_record_trade` |
| `beneat_get_session_strategy` | Generate a complete strategy for the current trading session. Determines mode (aggressive/normal/conservative_recovery), max trades, exposure limits, focus markets, position sizing, and stop conditions. Use `enforce=true` to enforce strategy on-chain |

## Calibration: From Defaults to Quant

Beneat gets smarter as the agent trades more. Calibration uses the agent's real on-chain history (parsed via Helius) to derive risk parameters — not static config files.

- **Tier 1** (0-4 trades): Capital-based defaults from deposit amount + strategy type + risk tolerance
- **Tier 2** (5-19 trades): Behavioral analysis — win rate, loss streaks, revenge trading detection (trades within 120s of a loss)
- **Tier 3** (20+ trades): Full quantitative — VaR at 95% confidence, Sharpe ratio (annualized), max drawdown, Kelly criterion for position sizing, profit factor

A new agent starts at Tier 1 with conservative defaults. As it builds history, Beneat automatically graduates it to more sophisticated models. A reckless agent with a 30% win rate and revenge trading patterns gets tighter limits. A disciplined agent with a positive Sharpe ratio gets more room.

## Agent Analytics: Measuring Hallucination

`beneat_get_analytics` is the diagnostic layer. It parses your agent's on-chain trading history across all protocols (Jupiter, Drift, Raydium, Orca, Phoenix, Flash Trade, Meteora, and 20+ more) and computes metrics that tell the team building the agent exactly where it's failing.

### Metrics

| Metric | What it tells the agent team |
|--------|------------------------------|
| **Hallucination rate** | How often the agent's analysis is wrong, weighted by trade size. A 60% hallucination rate means the agent's reasoning produces bad trades more often than good ones. |
| **Signal accuracy by market** | Per-market and per-protocol win rates. "Your agent is 64% accurate on SOL-PERP but 28% on BTC-PERP" — restrict it to markets where its analysis works. |
| **Overconfidence index** | Does the agent size up on trades it loses? If large trades have lower win rates than small trades, the agent is most confident when it's most wrong. |
| **Tilt detection** | Performance after consecutive losses. If win rate drops from 52% to 20% after a loss streak, the agent's post-loss reasoning is degraded. |
| **Revenge hallucination rate** | Trades within 2 minutes of a loss — how often are they hallucinated? These are the most dangerous: fast, emotional-equivalent decisions. |
| **Trend analysis** | Is the agent improving or degrading? Compares recent performance to historical baseline. |
| **Recommendations** | Actionable plain-text guidance: which markets to avoid, what behavioral patterns to fix, whether the model is stale. |

### Example Output

```
beneat_get_analytics(wallet, lookback_days=30)
-> {
  "hallucination_rate": 0.42,
  "signal_accuracy": 0.58,
  "accuracy_by_market": {
    "JUPITER": { "trades": 45, "win_rate": 0.64, "hallucination_rate": 0.36 },
    "DRIFT":   { "trades": 22, "win_rate": 0.36, "hallucination_rate": 0.64 }
  },
  "overconfidence_index": 0.18,
  "tilt": { "detected": true, "severity": "moderate", "post_streak_win_rate": 0.25 },
  "revenge_hallucination": { "revenge_trade_count": 8, "revenge_win_rate": 0.12 },
  "trend": { "direction": "degrading" },
  "recommendations": [
    "Signal accuracy varies by market: JUPITER at 64% vs DRIFT at 36%. Consider restricting to markets where the agent's analysis is reliable.",
    "Overconfidence detected: the agent sizes up on trades it loses.",
    "Tilt detected (moderate): win rate drops from 52% to 25% after consecutive losses.",
    "Revenge trading detected: 8 trades within 2 minutes of a loss, with 12% win rate vs 58% baseline."
  ]
}
```

The team reads this and knows: their agent hallucinates on Drift perps, sizes up when wrong, and falls apart after loss streaks. Fix those three things and the agent improves. Beneat keeps it safe while they iterate.

### Protocol Support

Calibration and analytics parse on-chain history via Helius enhanced transactions. Any protocol that Helius recognizes is automatically supported:

Jupiter, Drift, Raydium, Orca, Phoenix, Meteora, Lifinity, OpenBook, Sanctum, Kamino, MarginFi, Zeta, Mango, Pump.fun, and more.

The agent doesn't need to specify what protocol it uses. Beneat detects it from the transaction source and computes metrics per-protocol automatically.

## Agent Coaching: From Guardrails to Growth

Beneat doesn't just stop bad trades — it makes agents better traders. The coaching system adds four capabilities that turn passive enforcement into active improvement:

### The Coaching Loop

```
1. Session Start: beneat_get_session_strategy(wallet)
   → Determines mode, trade limits, focus markets, stop conditions

2. Before Each Trade: beneat_check_trade(wallet, include_coaching=true)
   → Approval + coaching context: session state, suggested max size, avoid/best markets

3. During Trade: beneat_calibrate_confidence(wallet, confidence=0.8)
   → Maps agent's self-assessed confidence to historical accuracy in that range

4. After Each Trade: beneat_record_trade(wallet, pnl=-0.02, confidence=0.75)
   → Tracks PnL + confidence for calibration feedback loop

5. Periodically: beneat_get_playbook(wallet)
   → Evolving playbook: identity, market restrictions, behavioral rules, regime detection
```

### Session State Machine

The coaching system classifies the agent's current session into one of five states. Each state adjusts position sizing recommendations automatically:

| State | Trigger | Size Multiplier |
|-------|---------|----------------|
| `normal` | Default — no special conditions | 1.0x |
| `post_loss` | Last trade was a loss within 5 minutes | 0.5x |
| `tilt` | 3+ consecutive losses in session | 0.25x |
| `hot_streak` | 3+ consecutive wins in session | 0.8x |
| `post_lockout_recovery` | Recently unlocked from lockout | 0.33x |

The `hot_streak` multiplier is intentionally below 1.0 — agents that size up during win streaks exhibit overconfidence bias. The coaching system prevents this.

### Confidence Calibration

When agents record trades with a `confidence` value (0-1), the session store builds a calibration dataset. `beneat_calibrate_confidence` bins confidence into 5 ranges and computes actual accuracy per bin:

| Bin | Agent Says | History Shows |
|-----|-----------|---------------|
| 0.8-1.0 | "I'm very confident" | 55% win rate → calibrated down to 0.675 |
| 0.6-0.8 | "I'm fairly confident" | 62% win rate → calibrated stays ~0.7 |
| 0.0-0.2 | "I'm not confident" | 40% win rate → calibrated up to 0.3 |

The calibrated confidence drives position size recommendations. An agent that is overconfident in the 0.8-1.0 bin gets its sizes reduced. An agent that is underconfident gets nudged larger. The calibration curve is returned in every response so agent teams can visualize their agent's accuracy.

### Playbook Evolution

`beneat_get_playbook` generates a personalized playbook that evolves with each call as the agent accumulates more on-chain history:

- **Agent Identity**: Classified from trade frequency — "High-frequency scalper", "Active day trader", "Moderate swing trader", or "Conservative position trader"
- **Primary Markets**: Markets where the agent has demonstrated edge (win_rate > 50% with 5+ trades), rated as strong/moderate/weak
- **Restricted Markets**: Markets where the agent loses (win_rate < 40% with 3+ trades)
- **Position Sizing**: Half-Kelly fraction capped at 12.5% of capital, with per-state reduction multipliers
- **Behavioral Rules**: Automatically generated from detected patterns — tilt recovery rules, revenge trading prevention, overconfidence guards, market restrictions
- **Regime Detection**: Compares recent Sharpe ratio to baseline; flags when market conditions have shifted

With `enforce=true`, the playbook's position sizing constraints are written on-chain via unsigned transactions, and AgentWallet policy is synced to match.

### Directives: Machine-Readable Recommendations

`beneat_get_analytics` now returns `directives[]` alongside the existing text `recommendations[]`. Directives are structured for programmatic consumption:

| Directive Type | Severity | Triggered When |
|---------------|----------|---------------|
| `pause_trading` | critical | Hallucination rate > 60% |
| `avoid_market` | warning | Market win rate < 35% with 3+ trades |
| `focus_market` | info | Market win rate > 60% with 5+ trades |
| `reduce_size` | warning | Overconfidence index > 0.15 |
| `increase_cooldown` | warning/critical | Tilt detected or revenge trading worse than baseline |
| `restrict_trades` | warning | Performance trending down |

Each directive includes `type`, `severity`, `params` (relevant data), and `reason` (human-readable explanation). Agents can switch on `directive.type` rather than parsing natural language recommendations.

## Agent-to-Agent Verification

`beneat_verify_agent` turns Beneat from a personal risk tool into a trust protocol. Any agent can check another agent's on-chain reputation before transacting with them.

The trust score (0-100) and risk grade (A-F) are derived entirely from on-chain data:

| Factor | Points | What it proves |
|--------|--------|----------------|
| Has a vault | +20 | Agent opted into risk management |
| Lockout configured | +10 | Willing to be restricted |
| Loss limit set | +10 | Has defined boundaries |
| Trade limit set | +10 | Controls frequency |
| Deposited >1 SOL | +5 | Skin in the game |
| Has lockout history | +5 | System has actually enforced limits |
| Has trader profile | +15 | Track record exists |
| 10+ trades | +5 | Not brand new |
| 100+ trades | +5 | Seasoned |
| 7+ trading days | +5 | Sustained activity |
| Rating above 60 | +5 | Quantitatively decent |
| High discipline | +5 | Low revenge trading |

This creates a network effect. As more agents register vaults and build trading history, the verification scores become more meaningful. An agent marketplace where "Grade A verified by Beneat" carries weight — backed by real on-chain data, not self-reported claims.

## Typical Agent Flows

### Flow 1: Self-Regulation

```
1. beneat_calibrate(wallet, deposit=5, strategy="day_trading", risk="medium")
   -> Returns unsigned transactions to sign & submit
   -> Auto-syncs AgentWallet policy: { max_per_tx_usd: "22.50" }

2. Before each trade:
   beneat_check_trade(wallet, market="SOL-PERP", size=0.5)
   -> { approved: true, trades_remaining: 18, daily_budget_remaining: "0.1450 SOL" }
   -> If lockout just expired: { restoration: { agentwallet_restored: true } }

3. After each trade:
   beneat_record_trade(wallet, pnl=-0.02, market="SOL-PERP")
   -> { lockout_triggered: false, warnings: ["80% of daily budget consumed"] }

   If loss limit breached:
   -> { lockout_triggered: true, enforcement: { agentwallet_frozen: true } }
   -> Agent cannot transact until lockout expires

4. Periodically:
   beneat_health_check(wallet)
   -> { drift_positions: [...], warnings: ["SOL-PERP: unrealized loss of $52.30"] }
```

### Flow 2: Diagnosing Hallucination

```
1. Agent team notices poor performance after a week of trading

2. beneat_get_analytics(wallet, lookback_days=7)
   -> hallucination_rate: 0.55, accuracy_by_market: {
        JUPITER: { win_rate: 0.62 }, DRIFT: { win_rate: 0.28 }
      }
   -> recommendations: ["Restrict to markets where analysis is reliable",
                         "Tilt detected: post-loss reasoning is degraded"]

3. Team updates the agent's system prompt:
   - Adds explicit post-loss cooldown reasoning
   - Restricts perp trading to demo mode
   - Keeps Jupiter swaps active

4. beneat_recalibrate(wallet)
   -> Tighter limits on perp markets, unchanged on swaps

5. After another week:
   beneat_get_analytics(wallet, lookback_days=7)
   -> hallucination_rate: 0.35, trend: "improving"
   -> The fix worked. Agent is measurably better.
```

### Flow 3: Agent-to-Agent Trust

```
1. Agent A wants to enter a trade with Agent B as counterparty

2. Agent A verifies Agent B:
   beneat_verify_agent(agent_b_wallet)
   -> { trust_score: 72, risk_grade: "B", factors: ["has_vault", "10plus_trades", "loss_limit_set"] }

3. Agent A verifies Agent C (alternative counterparty):
   beneat_verify_agent(agent_c_wallet)
   -> { trust_score: 25, risk_grade: "D", factors: ["has_vault"] }

4. Agent A chooses Agent B — higher trust score, more on-chain evidence of disciplined trading
```

### Flow 4: Emergency Freeze

```
1. Human operator detects anomalous behavior

2. beneat_set_policy(wallet, action="freeze")
   -> { success: true, detail: "AgentWallet frozen. max_per_tx_usd set to 0." }

3. Agent attempts to trade -> transaction signing fails
   Agent calls beneat_check_trade -> sees lockout active

4. After investigation:
   beneat_set_policy(wallet, action="restore")
   -> { success: true, detail: "AgentWallet policy restored to normal spending limits." }
```

### Flow 5: Coached Trading Session

```
1. Session starts. Agent requests strategy:
   beneat_get_session_strategy(wallet)
   -> { mode: "conservative_recovery", max_trades: 10,
        max_exposure_sol: 0.075, focus_markets: ["JUPITER"],
        stop_trading_conditions: ["Stop if 3 consecutive losses", "Stop if daily PnL < -0.0750 SOL"] }

2. Before first trade:
   beneat_check_trade(wallet, market="SOL-PERP", include_coaching=true)
   -> { approved: true, coaching: {
        session_state: "post_lockout_recovery",
        confidence_adjustment: 0.6,
        suggested_max_size_sol: 0.0165,
        avoid_markets: ["DRIFT"],
        best_market: "JUPITER",
        reasoning: "Session state: post_lockout_recovery. Confidence adjustment: 0.6 (overconfidence/tilt detected)..."
      }}

3. Agent calibrates confidence before sizing:
   beneat_calibrate_confidence(wallet, confidence=0.8)
   -> { calibrated_confidence: 0.65, position_size_recommendation_sol: 0.0325,
        insight: "Historical accuracy at this level is 55%, lower than your reported 80%. Calibrated down to 65%." }

4. Agent executes trade, then records result:
   beneat_record_trade(wallet, pnl=0.02, market="SOL-PERP", confidence=0.8)
   -> { recorded: true, session_summary: { trade_count: 1, daily_pnl_sol: 0.02 } }

5. After several trades, agent requests playbook:
   beneat_get_playbook(wallet, enforce=true)
   -> { playbook: { identity: "Active day trader", primary_markets: [...],
        behavioral_rules: [{ trigger: "Tilt detected after consecutive losses",
                             action: "Reduce position size by 50% and increase cooldown by 2x" }] },
        unsigned_transactions: [...] }
```

### Flow 6: Community Leaderboard

```
1. Visit /leaderboard on the web app

2. See ranked list of all agents with Beneat vaults:
   - Trust Grade (A-F), Overall Rating, Win Rate, P&L
   - Discipline score, Lockout count, Trading Days
   - Sortable by any metric

3. Click any agent to see their detail page:
   - Full TraderCard with tier-based design (Bronze → Legendary)
   - Performance stats: all six sub-ratings as bar charts
   - Risk configuration: daily loss limit, max trades, cooldown, lockout duration
   - Lockout history: count, current status, enforcement record

4. Via MCP tool:
   beneat_get_leaderboard(limit=10, sort_by="rating")
   -> { entries: [...], total: 42 }
   AI agents can programmatically query the leaderboard to find trusted counterparties
```

## Design Principles

- **Agents are the users** — MCP tools are the product surface. No human dashboard needed because the customers don't have browsers.
- **Never holds private keys** — all write operations return unsigned base64 VersionedTransactions for external signing
- **Enforcement has teeth** — AgentWallet policy freeze means the agent physically cannot sign transactions. Advisory mode exists as a fallback, not the default.
- **Automatic lifecycle** — calibrate syncs policy, record_trade freezes on breach, check_trade restores on expiry. No manual intervention required.
- **Graceful degradation** — works without AgentWallet (advisory), without Helius (Tier 1 only), without Drift, without existing vault
- **On-chain source of truth** — vault state, trader profile, and lockout history all live in Solana PDAs. Nothing is stored in the MCP server's memory except ephemeral session tracking.
- **Protocol-agnostic** — works with any trading protocol on Solana. Jupiter, Drift, Raydium, Flash Trade, Phoenix — Beneat detects the protocol from on-chain history and computes per-protocol analytics automatically.
- **Universal compatibility** — any agent framework that supports MCP can plug in Beneat. Claude, GPT, open-source agents, custom bots.
- **Coaching over punishment** — lockouts enforce limits, but coaching tools teach agents to stay within them. The goal is fewer lockouts over time, not more.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | No | Solana RPC endpoint (defaults to devnet) |
| `HELIUS_API_KEY` | No | Helius API key for transaction history (enables Tier 2/3 calibration) |
| `HELIUS_RPC_URL` | No | Alternative RPC URL (Helius RPC) |
| `SOL_PRICE_USD` | No | SOL price in USD for policy conversion (defaults to 150) |

## AgentWallet Config

Beneat reads AgentWallet credentials from `~/.agentwallet/config.json`:

```json
{
  "apiToken": "mf_...",
  "username": "your_username"
}
```

When present, the following automatic enforcement is active:

| Event | Enforcement Action |
|-------|-------------------|
| `beneat_calibrate` completes | Syncs AgentWallet policy from vault rules |
| `beneat_record_trade` triggers lockout | Freezes policy (`max_per_tx_usd: "0"`) |
| `beneat_check_trade` detects lockout expired | Restores policy to pre-freeze limits |
| `beneat_set_policy(action="freeze")` | Manual emergency freeze |
| `beneat_set_policy(action="sync")` | Re-derive policy from current vault rules |

## Programs (Devnet)

| Program | Address |
|---------|---------|
| Vault | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` |
