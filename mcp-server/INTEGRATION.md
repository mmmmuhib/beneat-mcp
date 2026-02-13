# Beneat Risk MCP — Developer Integration Guide

Beneat is an MCP server that provides quantitative risk management, coaching, and semantic tool routing for AI trading agents on Solana. It exposes 19 tools (18 core + 1 smart router) over stdio transport, HTTP (MCP Streamable HTTP), and a plain REST API. The server reads on-chain vault state, enforces trade rules, computes behavioral analytics, coaches agents on position sizing and market selection, builds unsigned transactions for risk parameter updates, and routes natural-language intents to the most relevant tools via Cohere Rerank.

Any agent framework that supports MCP — Claude, GPT, open-source agents, custom bots — can integrate Beneat with zero code changes to the agent itself.

---

## Quick Start

### MCP Configuration

Add Beneat to your agent's MCP config:

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

Build first:

```bash
cd mcp-server
npm install
npm run build
```

---

## HTTP / REST API

The server supports HTTP mode alongside stdio. Start it with:

```bash
npm run start:http                              # Default port 3001
node dist/index.js --http --port 8080           # Custom port
```

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Server status, tool count, uptime |
| `GET` | `/api/tools` | OpenAI-compatible tool manifest (JSON Schema parameters) |
| `POST` | `/api/tools/:name` | Call any tool by name — JSON body = tool params, JSON response = tool output |
| `POST` | `/api/route` | Semantic tool routing — accepts `{ intent, top_n?, wallet_address? }`, returns ranked tools |
| `POST` | `/mcp` | MCP Streamable HTTP — for MCP SDK clients connecting over network |

### REST API Request / Response

Call any tool by posting its parameters as JSON to `/api/tools/<tool_name>`:

```bash
# Request
curl -X POST http://localhost:3001/api/tools/beneat_get_status \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"YourWalletBase58Address"}'

# Response (200 OK)
{
  "vault_exists": true,
  "is_locked": false,
  "can_trade": true,
  "trades_today": 3,
  "trades_remaining": 17,
  "daily_loss_limit_sol": 0.15,
  "cooldown_seconds": 120
}
```

### Error Responses

| Status | When | Body |
|--------|------|------|
| `400` | Invalid JSON in request body | `{ "error": "Invalid JSON" }` |
| `404` | Tool name not found | `{ "error": "Tool 'bad_name' not found" }` |
| `422` | Zod validation failed | `{ "error": "Validation failed", "details": [...] }` |
| `500` | Tool handler threw | `{ "error": "..." }` |

### CORS

All responses include `Access-Control-Allow-Origin: *`. The server handles `OPTIONS` preflight requests, so browser-based clients work out of the box.

### MCP-over-HTTP

MCP SDK clients can connect over HTTP instead of stdio using `StreamableHTTPClientTransport`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3001/mcp")
);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`${tools.length} tools available`);
```

This is useful when the MCP server runs on a different machine, in a container, or when you want multiple agents to share one server instance.

---

## Remote Server

### Deploy to Railway

1. Push to GitHub
2. Connect Railway to your repo, set root directory to `mcp-server`
3. Set environment variables in Railway dashboard:
   - `MCP_AUTH_TOKEN` — a secret bearer token for authentication
   - `SOLANA_RPC_URL`, `HELIUS_API_KEY`, `SOL_PRICE_USD` as needed
   - `PORT` is set automatically by Railway
4. Railway uses `railway.toml` for build/deploy config — no manual setup needed
5. After deploy, your MCP endpoint is: `https://your-app.up.railway.app/mcp`

### Auth

Set `MCP_AUTH_TOKEN` to require bearer token authentication on all endpoints (except `/health`, `/.well-known/*`, `/register`, and `/oauth/token`).

Two auth paths work in parallel:

1. **Static bearer token** — set `MCP_AUTH_TOKEN` and pass it directly as `Authorization: Bearer <token>`.
2. **OAuth 2.0 Dynamic Client Registration** — spec-compliant MCP clients (Claude.ai, open-source agents) discover endpoints via `/.well-known/oauth-authorization-server`, register a client, and exchange credentials for a 1-hour access token.

```bash
# Static token
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/tools

# Health check — no auth required
curl http://localhost:3001/health

# OAuth 2.1 discovery — no auth required
curl http://localhost:3001/.well-known/oauth-protected-resource
curl http://localhost:3001/.well-known/oauth-authorization-server
```

Without `MCP_AUTH_TOKEN` set, all endpoints are open access.

### OAuth Flow (for spec-compliant MCP clients)

When `MCP_AUTH_TOKEN` is set, agents can authenticate via the standard OAuth 2.0 `client_credentials` flow:

```bash
# 1. Discover auth server metadata
curl https://your-app.up.railway.app/.well-known/oauth-authorization-server
# → { token_endpoint, registration_endpoint, ... }

# 2. Register a client (open — no auth required)
curl -X POST https://your-app.up.railway.app/register \
  -H "Content-Type: application/json" \
  -d '{"client_name": "my-trading-agent"}'
# → { client_id: "bnrt_cid_...", client_secret: "bnrt_sec_...", ... }

# 3. Exchange credentials for an access token (1h TTL)
curl -X POST https://your-app.up.railway.app/oauth/token \
  -d "grant_type=client_credentials&client_id=bnrt_cid_...&client_secret=bnrt_sec_..."
# → { access_token: "bnrt_at_...", token_type: "Bearer", expires_in: 3600, scope: "mcp:tools" }

# 4. Use the token
curl -H "Authorization: Bearer bnrt_at_..." https://your-app.up.railway.app/mcp
```

Client registrations expire after 24h of inactivity. Access tokens expire after 1 hour — repeat step 3 to get a new one.

Rate limit: 10 client registrations per minute.

### Claude Desktop via mcp-remote

Connect Claude Desktop to a remote Beneat server using `mcp-remote`:

```json
{
  "mcpServers": {
    "beneat-risk": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-app.up.railway.app/mcp",
        "--header",
        "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

### MCP SDK Client (Authenticated)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("https://your-app.up.railway.app/mcp"),
  {
    requestInit: {
      headers: { Authorization: "Bearer YOUR_TOKEN" },
    },
  }
);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`${tools.length} tools available`);
```

### Connecting from Different Platforms

| Platform | Method | Auth |
|----------|--------|------|
| Claude Desktop / Cursor (local) | stdio config | N/A (local process) |
| Claude Desktop / Cursor (remote) | `npx mcp-remote` | `--header "Authorization: Bearer ..."` |
| Claude.ai "Add Connector" | Paste URL | OAuth DCR (automatic) |
| Remote MCP client (TS/JS) | `StreamableHTTPClientTransport` | Bearer header or OAuth DCR |
| Python / Go / Rust / curl | `POST /api/tools/:name` | Bearer header |
| Ollama / vLLM | Load manifest → function call → POST | Bearer header |
| LangChain / CrewAI | MCP adapter or HTTP wrapper | Bearer header or OAuth DCR |

---

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SOLANA_RPC_URL` | No | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `HELIUS_RPC_URL` | No | Falls back to SOLANA_RPC_URL | Alternative RPC (Helius) |
| `HELIUS_API_KEY` | For calibrate/analytics/coaching | — | Helius transaction history API |
| `SOL_PRICE_USD` | No | `"150"` | SOL price for AgentWallet USD limits |
| `MCP_AUTH_TOKEN` | No | (open access) | Bearer token for HTTP auth |
| `PUBLIC_URL` | No | (auto-detected) | Base URL for OAuth 2.1 discovery |
| `COHERE_API_KEY` | No | (fallback mode) | Cohere Rerank API key for semantic tool routing via `beneat_smart_route` and `/api/route` |

### AgentWallet Setup (Optional)

For full enforcement (wallet-level transaction blocking), set up AgentWallet:

```bash
curl -X POST https://agentwallet.mcpay.tech/api/connect/start \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com"}'

curl -X POST https://agentwallet.mcpay.tech/api/connect/complete \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","email":"your@email.com","otp":"123456"}'
```

Save credentials:

```json
// ~/.agentwallet/config.json
{
  "apiToken": "mf_...",
  "username": "YOUR_USERNAME"
}
```

Without AgentWallet, tools run in advisory mode — they return approval/denial JSON but cannot block transactions at the wallet level.

---

## Tool Reference

### Observation Tools

#### beneat_get_status

Get the current vault status for a wallet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

**Key output:** `is_locked`, `lockout_until`, `trades_today`, `trades_remaining`, `daily_loss_limit_sol`, `cooldown_seconds`, `can_trade`

#### beneat_get_profile

Get the on-chain trader profile.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

**Key output:** `overall_rating`, `discipline`, `patience`, `consistency`, `timing`, `risk_control`, `endurance`, `total_trades`, `total_wins`, `total_pnl`

#### beneat_verify_agent

Verify an agent's on-chain risk reputation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

**Key output:** `trust_score` (0-100), `risk_grade` (A-F), `factors[]`

#### beneat_health_check

Check portfolio health including Drift perpetual positions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

**Key output:** `vault`, `session`, `drift_positions[]`, `warnings[]`

#### beneat_cancel_swap

Diagnose a stuck swap_in_progress state on the vault.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

**Key output:** `swap_in_progress`, `pending_swap_details`, `resolution_steps`

#### beneat_get_leaderboard

Get ranked leaderboard of all Beneat-verified agents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of entries (default 10) |
| `sort_by` | string | No | Sort field: `rating`, `win_rate`, `trades`, `discipline` |

**Key output:** `entries[]` with `wallet`, `trust_grade`, `trust_score`, `overall_rating`, `discipline`, `win_rate`, `total_trades`, `total_pnl`, `lockout_count`

---

### Risk Enforcement Tools

#### beneat_check_trade

Pre-flight check: can this agent trade right now?

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `market` | string | No | Market identifier (e.g. SOL-PERP) |
| `size` | number | No | Trade size in SOL |
| `direction` | string | No | `"long"` or `"short"` |
| `leverage` | number | No | Leverage multiplier |
| `include_coaching` | boolean | No | Include coaching context (default true) |

**Key output:** `approved`, `can_trade`, `reasons[]`, `trades_remaining`, `daily_budget_remaining_sol`, `coaching`

The `coaching` field (when `include_coaching` is not false) contains:

```json
{
  "session_state": "post_loss",
  "confidence_adjustment": 0.7,
  "suggested_max_size_sol": 0.0412,
  "avoid_markets": ["DRIFT"],
  "best_market": "JUPITER",
  "reasoning": "Session state: post_loss. Confidence adjustment: 0.7 (overconfidence/tilt detected). Avoid markets with <35% win rate: DRIFT. Best performing market: JUPITER (64% win rate)."
}
```

Set `include_coaching: false` for high-frequency agents that need minimal latency on pre-flight checks.

#### beneat_record_trade

Record a completed trade's P&L in the session tracker.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `pnl` | number | Yes | Trade P&L in SOL (positive = profit, negative = loss) |
| `market` | string | No | Market identifier (e.g. SOL-PERP) |
| `confidence` | number (0-1) | No | Agent's confidence in this trade. Used for confidence calibration |

**Key output:** `recorded`, `session_summary` (trade_count, daily_pnl_sol), `lockout_triggered`, `lockout_reason`, `enforcement`, `warnings[]`

When `lockout_triggered` is true and AgentWallet is configured, the agent's wallet policy is frozen (`max_per_tx_usd: "0"`).

---

### Calibration Tools

#### beneat_calibrate

Auto-calibrate risk parameters from on-chain trading history. Returns unsigned transactions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `deposit_amount` | number | No | Amount to deposit in SOL |
| `strategy_type` | string | No | `"scalping"`, `"day_trading"`, `"swing_trading"`, `"conservative"` |
| `risk_tolerance` | string | No | `"low"`, `"medium"`, `"high"`, `"degen"` |
| `lookback_days` | number | No | Days of history to analyze (default 30) |

**Calibration tiers:**
- **Tier 1** (0-4 trades): Capital-based defaults from deposit + strategy + risk tolerance
- **Tier 2** (5-19 trades): Behavioral — adjusts for win rate, loss streaks, revenge trading
- **Tier 3** (20+ trades): Quantitative — VaR 95%, Sharpe ratio, Kelly fraction, profit factor, max drawdown

**Key output:** `calibration` (tier, strategy, trades_analyzed), `parameters` (daily_loss_limit, max_trades, lockout_duration, cooldown), `analysis`, `unsigned_transactions[]`, `policy_sync`

#### beneat_recalibrate

Re-run calibration with latest history. Shorthand for `beneat_calibrate` with default parameters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |

---

### Agent Improvement Tools

#### beneat_get_playbook

Generate a personalized, evolving trading playbook.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `lookback_days` | number | No | Days of history to analyze (default 30) |
| `enforce` | boolean | No | Generate unsigned TXs to enforce playbook rules on-chain |

**Key output:**

```json
{
  "playbook": {
    "identity": "Active day trader",
    "primary_markets": [
      { "market": "JUPITER", "win_rate": 0.64, "trades": 45, "avg_pnl_sol": 0.012, "edge_rating": "moderate" }
    ],
    "restricted_markets": ["DRIFT"],
    "position_sizing": {
      "kelly_fraction": 0.18,
      "half_kelly_sol": 0.045,
      "max_position_pct": 18,
      "state_reductions": {
        "normal": 1.0,
        "post_loss": 0.5,
        "tilt": 0.25,
        "hot_streak": 0.8,
        "post_lockout_recovery": 0.33
      }
    },
    "behavioral_rules": [
      { "trigger": "Trade attempted within 2 minutes of a loss", "action": "Block trade and enforce minimum 5-minute cooldown", "source": "revenge_detection" },
      { "trigger": "Position size exceeds 2x median", "action": "Cap position size at median and require explicit override", "source": "overconfidence_detection" }
    ],
    "regime": {
      "assessment": "normal",
      "recent_sharpe": 1.2,
      "baseline_sharpe": 0.8,
      "drift_detected": false
    },
    "expectancy_sol": 0.0045,
    "profit_factor": 1.35
  },
  "unsigned_transactions": [...],
  "policy_sync": { "agentwallet_synced": true }
}
```

With `enforce=true`, playbook-derived position sizing rules are written on-chain and AgentWallet policy is synced.

#### beneat_calibrate_confidence

Calibrate agent confidence against historical accuracy.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `confidence` | number (0-1) | Yes | Agent's confidence in the next trade |

**Key output:**

```json
{
  "calibration": {
    "input_confidence": 0.8,
    "calibrated_confidence": 0.65,
    "historical_accuracy": 0.55,
    "position_size_recommendation_sol": 0.0325,
    "insight": "Your historical accuracy at this confidence level is 55%, lower than your reported 80%. Calibrated down to 65%.",
    "calibration_curve": [
      { "range": "0.0-0.2", "actual_accuracy": 0.4, "trade_count": 5 },
      { "range": "0.2-0.4", "actual_accuracy": 0.45, "trade_count": 8 },
      { "range": "0.4-0.6", "actual_accuracy": 0.52, "trade_count": 12 },
      { "range": "0.6-0.8", "actual_accuracy": 0.62, "trade_count": 15 },
      { "range": "0.8-1.0", "actual_accuracy": 0.55, "trade_count": 10 }
    ]
  }
}
```

Requires trades recorded with `confidence` via `beneat_record_trade`. Needs 3+ trades per bin for meaningful calibration.

#### beneat_get_session_strategy

Generate a complete strategy for the current trading session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `lookback_days` | number | No | Days of history to analyze (default 30) |
| `enforce` | boolean | No | Generate unsigned TXs to enforce strategy on-chain |

**Key output:**

```json
{
  "strategy": {
    "mode": "conservative_recovery",
    "reason": "Recent lockout detected. Conservative mode to rebuild confidence.",
    "max_trades": 10,
    "max_exposure_sol": 0.075,
    "focus_markets": ["JUPITER"],
    "position_size_sol": 0.0165,
    "stop_trading_conditions": [
      "Stop if 3 consecutive losses",
      "Stop if daily PnL < -0.0750 SOL",
      "Stop if any single trade loses > 50% of session budget"
    ]
  }
}
```

**Session modes:**

| Mode | When | Effect |
|------|------|--------|
| `conservative_recovery` | Post-lockout or tilt detected | 50% of normal trade limit, 50% exposure, doubled cooldown |
| `normal` | Standard conditions | 80% of max trade limit, full exposure |
| `aggressive` | Trending up + hot streak | 100% of max trade limit, full exposure |

With `enforce=true`, strategy parameters are written on-chain (max trades, daily loss limit from max exposure, doubled cooldown in recovery mode).

#### beneat_get_analytics

Agent performance analytics with machine-readable directives.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `lookback_days` | number | No | Days of history to analyze (default 30) |

**Key output:** `analytics` (hallucination_rate, signal_accuracy, accuracy_by_market, overconfidence_index, tilt, revenge_hallucination, trend, recommendations[]), `directives[]`

The `directives[]` array contains structured, machine-readable recommendations:

```json
{
  "directives": [
    { "type": "avoid_market", "severity": "warning", "params": { "market": "DRIFT", "win_rate": 0.28, "trades": 22 }, "reason": "DRIFT has 28% win rate across 22 trades." },
    { "type": "focus_market", "severity": "info", "params": { "market": "JUPITER", "win_rate": 0.64, "trades": 45 }, "reason": "JUPITER has 64% win rate across 45 trades — strong signal." },
    { "type": "reduce_size", "severity": "warning", "params": { "overconfidence_index": 0.18 }, "reason": "Agent sizes up on trades it loses. Large trades have lower win rate than small trades." },
    { "type": "increase_cooldown", "severity": "warning", "params": { "severity": "moderate" }, "reason": "Tilt detected (moderate): win rate drops from 52% to 25% after losses." }
  ]
}
```

**Directive types:** `pause_trading`, `avoid_market`, `focus_market`, `reduce_size`, `increase_cooldown`, `restrict_trades`

**Severity levels:** `info`, `warning`, `critical`

---

### Policy Management

#### beneat_set_policy

Manage AgentWallet spending policy. Requires `~/.agentwallet/config.json`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet_address` | string | Yes | Solana wallet address (base58) |
| `action` | string | Yes | `"freeze"`, `"restore"`, `"sync"`, `"status"` |

| Action | Effect |
|--------|--------|
| `freeze` | Set `max_per_tx_usd` to 0 — blocks all transactions |
| `restore` | Restore pre-freeze spending limits |
| `sync` | Derive AgentWallet limits from vault risk rules |
| `status` | View current AgentWallet policy and frozen state |

---

### Semantic Tool Routing

#### beneat_smart_route

Route a natural-language intent to the most relevant tools. Uses Cohere Rerank for semantic scoring, blended with session-state weights.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `intent` | string | Yes | Natural-language description of what the agent wants to do |
| `top_n` | number (1-18) | No | Number of tools to return (default 5) |
| `wallet_address` | string | No | Wallet address for session-aware routing |

**Key output:** `intent`, `session_state`, `reranked` (boolean), `model`, `tools[]` (name, title, description, category, relevance_score), `tip`

When `wallet_address` is provided, the agent's current session state (normal, post_loss, tilt, hot_streak, post_lockout_recovery) is used to boost contextually relevant tools. For example, in `tilt` state, `beneat_get_status` and `beneat_get_analytics` are boosted while `beneat_check_trade` is deprioritized.

**Scoring formula:** `relevance = semantic_score * 0.7 + session_weight * 0.3`

**Graceful degradation:** Without `COHERE_API_KEY`, all tools score 0.5 and session weights alone break ties.

Also available as `POST /api/route` with the same JSON body for REST clients.

---

## The Coaching System

### Session State Machine

The coaching system classifies the agent's current session state and adjusts recommendations accordingly:

| State | Trigger | Size Multiplier | Description |
|-------|---------|----------------|-------------|
| `normal` | Default | 1.0x | Standard operating conditions |
| `post_loss` | Last trade was a loss within 5 min | 0.5x | Reduce exposure after recent loss |
| `tilt` | 3+ consecutive losses in session | 0.25x | Aggressive reduction — agent reasoning is degraded |
| `hot_streak` | 3+ consecutive wins in session | 0.8x | Slight reduction — prevents overconfidence on streaks |
| `post_lockout_recovery` | Recently unlocked from lockout | 0.33x | Most conservative — rebuild confidence first |

State is checked in priority order: `post_lockout_recovery` > `tilt` > `post_loss` > `hot_streak` > `normal`.

### Coaching Loop

The recommended integration pattern for full coaching:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Session Start                                                           │
│   beneat_get_session_strategy(wallet)                                   │
│   → mode, max_trades, max_exposure, focus_markets, stop_conditions      │
├─────────────────────────────────────────────────────────────────────────┤
│ Before Each Trade                                                       │
│   beneat_check_trade(wallet, market, size, include_coaching=true)        │
│   → approved/denied + coaching (state, max_size, avoid/best markets)    │
│                                                                         │
│   beneat_calibrate_confidence(wallet, confidence=0.8)                   │
│   → calibrated confidence + position size recommendation               │
├─────────────────────────────────────────────────────────────────────────┤
│ After Each Trade                                                        │
│   beneat_record_trade(wallet, pnl, market, confidence=0.8)              │
│   → session summary, lockout check, warnings                           │
├─────────────────────────────────────────────────────────────────────────┤
│ End of Session / Periodically                                           │
│   beneat_get_playbook(wallet)                                           │
│   → evolving identity, markets, rules, regime detection                │
│                                                                         │
│   beneat_get_analytics(wallet)                                          │
│   → hallucination diagnostics + structured directives                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Confidence Calibration

The confidence system requires two steps:

1. **Recording**: Call `beneat_record_trade` with `confidence` on each trade. This builds a per-bin accuracy dataset.
2. **Querying**: Call `beneat_calibrate_confidence` before a trade to get calibrated confidence and position size.

The system bins confidence into 5 ranges (0-0.2, 0.2-0.4, ..., 0.8-1.0) and computes actual accuracy per bin. Calibrated confidence = `(input + historical_accuracy) / 2`. Needs 3+ trades per bin for meaningful calibration; returns raw confidence if insufficient data.

### Playbook Evolution

The playbook is not static — it recomputes each call based on current on-chain history. Over time:

- **Identity stabilizes** as trade frequency patterns emerge
- **Markets shift** as the agent finds (or loses) edge
- **Behavioral rules accumulate** as tilt, revenge, overconfidence patterns are detected
- **Regime detection** flags when market conditions change (Sharpe ratio drift > 0.5)

Call `beneat_get_playbook(enforce=true)` to write playbook-derived rules on-chain.

### Directives

The `directives[]` array from `beneat_get_analytics` is designed for programmatic consumption. Each directive has:

- `type` — action to take: `reduce_size`, `avoid_market`, `increase_cooldown`, `restrict_trades`, `focus_market`, `pause_trading`
- `severity` — `info` (suggestion), `warning` (should act), `critical` (must act)
- `params` — relevant data (market name, win rate, overconfidence index, etc.)
- `reason` — human-readable explanation

Agents can switch on `directive.type`:

```
for directive in directives:
  if directive.type == "avoid_market":
    remove directive.params.market from candidate list
  if directive.type == "reduce_size":
    multiply position size by 0.5
  if directive.type == "pause_trading":
    stop trading this session
```

---

## Integration Patterns

### Minimal Integration (Risk Only)

Add 3 tool calls to your agent — no coaching, no playbook. Just risk enforcement.

```
Before trade:
  beneat_check_trade(wallet, market, size)
  → if not approved: skip trade

After trade:
  beneat_record_trade(wallet, pnl, market)
  → if lockout_triggered: stop trading
```

### Standard Integration (Calibrate + Enforce)

One-time setup + ongoing enforcement.

```
Setup (once):
  beneat_calibrate(wallet, deposit=5, strategy="day_trading", risk="medium")
  → sign and submit unsigned transactions

Trading loop:
  beneat_check_trade(wallet) → approve/deny
  execute trade
  beneat_record_trade(wallet, pnl) → lockout check

Periodic:
  beneat_recalibrate(wallet) → update rules from latest history
  beneat_get_analytics(wallet) → diagnose hallucination patterns
```

### Full Coaching Integration

Session-aware trading with confidence calibration and evolving playbook.

```
Session start:
  strategy = beneat_get_session_strategy(wallet)
  remaining_trades = strategy.max_trades
  focus = strategy.focus_markets

Trading loop:
  check = beneat_check_trade(wallet, market, include_coaching=true)
  if not check.approved: skip
  if market in check.coaching.avoid_markets: skip or reduce size

  cal = beneat_calibrate_confidence(wallet, confidence=my_confidence)
  size = min(cal.position_size_recommendation_sol, check.coaching.suggested_max_size_sol)

  execute trade with size
  beneat_record_trade(wallet, pnl, market, confidence=my_confidence)

  remaining_trades--
  if remaining_trades <= 0: stop
  check stop_trading_conditions

End of session:
  beneat_get_playbook(wallet, enforce=true)
  beneat_get_analytics(wallet) → review directives
```

---

## The Enforce Flag

The `enforce` parameter on `beneat_get_playbook` and `beneat_get_session_strategy`:

| Value | Behavior |
|-------|----------|
| `false` (default) | Returns analysis/strategy as advisory JSON. No on-chain changes. |
| `true` | Returns advisory JSON **plus** unsigned base64 `VersionedTransaction` objects to write derived rules on-chain. Also syncs AgentWallet policy when configured. |

Unsigned transactions must be signed by the wallet owner and submitted to Solana. The MCP server never holds private keys.

---

## Programs (Devnet)

| Program | Address |
|---------|---------|
| Vault | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` |
| Drift | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` |

---

## Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| "No vault found" | Agent hasn't calibrated yet | Call `beneat_calibrate` first to create a vault |
| "Insufficient history for calibration" | Fewer than 5 on-chain trades | Tier 1 (capital-based) calibration is used automatically |
| "Coaching context is empty" | No Helius API key or insufficient trade history | Set `HELIUS_API_KEY` env var; coaching requires on-chain trades to analyze |
| "AgentWallet config not found" | `~/.agentwallet/config.json` missing | Advisory mode is active — no wallet-level enforcement |
| "Confidence calibration insufficient" | Fewer than 3 trades per confidence bin | Record more trades with confidence to enable calibration |
| Session data missing after restart | Session store is in-memory only | Expected behavior — sessions reset on server restart |
| Helius API errors | Circuit breaker tripped after 3 failures | Wait 60s for half-open retry; check API key and rate limits |
| `include_coaching` adds latency | Coaching requires a Helius API call per check | Set `include_coaching: false` for high-frequency pre-flight checks |
