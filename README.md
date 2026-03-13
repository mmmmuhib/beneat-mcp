# @beneat/risk-mcp-server

Risk enforcement and behavioral coaching for AI trading agents. 19 tools (18 core + 1 semantic router) over MCP (stdio + HTTP) and a plain REST API — pre-trade validation, P&L tracking, session calibration, behavioral analytics, and natural-language intent routing via Cohere Rerank.

The reference implementation is wired to **Solana + Drift Protocol**. The chain adapters live in `src/lib/` — swap them out to use any exchange or chain. See [Adapting to Other Chains](#adapting-to-other-chains).

**Your agent trades. Beneat makes sure it doesn't blow up.**

## Hosted Instance

Beneat MCP is live at `https://beneat-mcp.onrender.com`. No installation required.

Add to any MCP client config:

```json
{
  "mcpServers": {
    "beneat": {
      "type": "streamable-http",
      "url": "https://beneat-mcp.onrender.com/mcp"
    }
  }
}
```

### REST API

```bash
curl https://beneat-mcp.onrender.com/health                                         # Health check
curl https://beneat-mcp.onrender.com/api/tools                                      # Tool manifest
curl -X POST https://beneat-mcp.onrender.com/api/tools/beneat_get_status \
  -H "Content-Type: application/json" -d '{"wallet_address":"YOUR_WALLET"}'          # Call any tool
curl -X POST https://beneat-mcp.onrender.com/api/route \
  -H "Content-Type: application/json" -d '{"intent":"am I safe to trade?"}'          # Semantic routing
```

## Self-Host

```bash
cd mcp-server
npm install && npm run build
npm run start:http    # HTTP on localhost:3001
npm run start         # stdio transport
```

Self-hosted REST API uses `http://localhost:3001` instead of the hosted URL.

Then add one line to your agent's system prompt:

> Before executing any trade, call `beneat_check_trade` with your wallet address. After every trade, call `beneat_record_trade` with the P&L.

Zero code changes to your trading logic. The MCP server handles enforcement.

## How It Works

```
Agent wants to trade
  │
  ├─ beneat_calibrate ──→ Sets risk rules (daily loss limit, max trades, cooldown)
  │                        Returns unsigned TXs to deploy on-chain
  │
  ├─ beneat_check_trade ──→ Pre-flight: lockout? cooldown? budget left?
  │                          Returns approved/denied + coaching context
  │
  ├─ [Agent executes trade]
  │
  ├─ beneat_record_trade ──→ Logs P&L in session tracker
  │                           Daily loss limit breached?
  │                             ├─ YES → Lockout triggered → AgentWallet FROZEN
  │                             └─ NO  → Continue trading
  │
  └─ beneat_check_trade ──→ DENIED (vault locked, wallet frozen)
                             Agent blocked until lockout expires
```

## Vault-Optional Mode

7 tools work without a Beneat vault account, falling back to Helius transaction history analysis:

| Mode | Enforcement | Trust Score Cap | Requirements |
|------|-------------|-----------------|--------------|
| **Enforced** (with vault) | On-chain lockouts + AgentWallet freeze | 100 | Vault deployed |
| **Advisory** (no vault) | Session tracking + recommendations | 40 | Just a wallet address |

Any Solana trading agent can start using Beneat immediately in advisory mode. Create a vault to unlock full enforcement.

## Tools (19)

### Core Enforcement

| Tool | Purpose |
|------|---------|
| `beneat_check_trade` | Pre-flight check: lockout, cooldown, trade count, daily loss budget. Returns approved/denied with reasons and optional coaching context |
| `beneat_record_trade` | Log trade P&L. Checks daily loss limit, triggers lockout if breached, freezes AgentWallet |
| `beneat_calibrate` | Auto-calibrate risk params from history. 3 tiers: capital-based → behavioral → quantitative (VaR, Sharpe, Kelly). Returns unsigned TXs |
| `beneat_recalibrate` | Re-run calibration with latest history |
| `beneat_set_policy` | AgentWallet policy control: freeze, restore, sync, status |

### Agent Coaching

| Tool | Purpose |
|------|---------|
| `beneat_get_session_strategy` | Session plan: mode (aggressive/normal/recovery), max trades, focus markets, stop conditions |
| `beneat_get_playbook` | Personalized playbook: identity, primary/restricted markets, Kelly position sizing, behavioral rules, regime detection |
| `beneat_get_analytics` | Behavioral analysis: hallucination rate, tilt, revenge trading, overconfidence. Returns machine-readable `directives[]` |
| `beneat_calibrate_confidence` | Map reported confidence (0-1) to historical accuracy. Returns calibrated confidence + position size recommendation |

### Discovery & Monitoring

| Tool | Purpose |
|------|---------|
| `beneat_get_status` | Vault lockout state, cooldown, trades remaining, can_trade flag |
| `beneat_get_profile` | On-chain reputation scores (8 ratings, 0-99 each), win rate, trading history |
| `beneat_verify_agent` | Trust score (0-100), risk grade (A-F). Use before accepting counterparty risk |
| `beneat_health_check` | Portfolio health: Drift perp positions (11 markets), unrealized P&L, warnings |
| `beneat_get_leaderboard` | Ranked agents by trust grade, discipline, win rate, P&L |
| `beneat_register_agent` | Self-signup for leaderboard tracking |
| `beneat_cancel_swap` | Diagnose stuck swap_in_progress state |

### Admin & Registration

| Tool | Purpose |
|------|---------|
| `beneat_reset_session` | Reset in-memory trading session (used by benchmarks) |
| `beneat_set_advisory_limits` | Configure advisory risk limits for a session (used by benchmarks) |
| `beneat_register_agent` | Register an AI agent on the leaderboard for tracking |

### Semantic Routing

| Tool | Purpose |
|------|---------|
| `beneat_smart_route` | Route natural-language intent to most relevant tools via Cohere Rerank. Session-aware scoring blends semantic relevance (70%) with per-tool session-state weights (30%). Falls back gracefully without `COHERE_API_KEY`. |

Also available as `POST /api/route` for REST clients outside MCP.

## Calibration Tiers

The calibration engine adapts to the agent's trade history:

| Tier | Trades Required | Method | Metrics |
|------|----------------|--------|---------|
| **Tier 1** | 0-4 | Capital-based | Strategy type + risk tolerance → base rules |
| **Tier 2** | 5-19 | Behavioral | Win rate, loss streaks, revenge trading ratio |
| **Tier 3** | 20+ | Quantitative | VaR 95%, Sharpe ratio, Kelly fraction, max drawdown, profit factor |

Strategy presets:

| Strategy | Max Trades/Day | Cooldown |
|----------|---------------|----------|
| `scalping` | 50 | 30s |
| `day_trading` | 20 | 120s |
| `swing_trading` | 5 | 600s |
| `conservative` | 3 | 1800s |

Risk tolerance levels:

| Level | Daily Loss Limit | Lockout Duration |
|-------|-----------------|-----------------|
| `low` | 1% of capital | 24 hours |
| `medium` | 3% | 12 hours |
| `high` | 5% | 6 hours |
| `degen` | 10% | 2 hours |

## Quick Start

```bash
# Build
cd mcp-server
npm install
npm run build

# Run the demo (full enforcement lifecycle)
npm run demo

# Run E2E tests (all 19 tools)
npm run test:e2e

# Start the server (stdio transport)
npm run start

# Start HTTP server (REST + MCP-over-HTTP)
npm run start:http

# Open MCP Inspector UI
npm run inspect
```

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SOLANA_RPC_URL` | No | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `HELIUS_RPC_URL` | No | Falls back to `SOLANA_RPC_URL` | Helius RPC endpoint |
| `HELIUS_API_KEY` | For analytics/calibration | - | Transaction history API |
| `SOL_PRICE_USD` | No | `150` | SOL price for USD conversions |
| `COHERE_API_KEY` | No | (fallback mode) | Cohere Rerank API key for semantic tool routing |

## Architecture

```
src/
├── index.ts                    # Server setup, 19 tool registrations, --http flag
├── http-server.ts              # HTTP server: REST endpoints + /api/route semantic routing
├── tool-registry.ts            # ToolDefinition interface, TOOL_REGISTRY, tool document builder
├── tools/                      # One file per tool
│   ├── check-trade.ts          # Core: pre-flight authorization
│   ├── record-trade.ts         # Core: P&L logging + lockout trigger
│   ├── calibrate.ts            # Core: 3-tier auto-calibration
│   ├── analytics.ts            # Behavioral analysis + directives
│   ├── playbook.ts             # Personalized trading playbook
│   ├── session-strategy.ts     # Dynamic session limits
│   ├── smart-route.ts          # Semantic tool routing via Cohere Rerank
│   └── ...                     # 12 more tools
├── lib/
│   ├── quant-engine.ts         # Calibration + analytics engine (~1250 lines)
│   ├── vault-reader.ts         # On-chain vault/profile/Drift deserialization
│   ├── transaction-builder.ts  # Unsigned VersionedTransaction construction
│   ├── session-store.ts        # In-memory session tracking + inferSessionState()
│   ├── reranker.ts             # Cohere Rerank client with graceful fallback
│   ├── helius-client.ts        # Helius API with circuit breaker
│   ├── agentwallet-client.ts   # AgentWallet policy enforcement
│   ├── scoring.ts              # Trust score (0-100) computation
│   ├── types.ts                # All TypeScript interfaces
│   ├── constants.ts            # Program IDs, seeds, strategy defaults
│   ├── utils.ts                # safeCall, bigintReplacer, jsonContent helpers
│   └── pda.ts                  # Vault & profile PDA derivation
└── generated/vault/            # Codama-generated IDL types (do not edit)
```

### Key Design Decisions

**Never signs transactions.** The server builds unsigned `VersionedTransaction` objects (base64-encoded) for the caller to sign. Private keys never touch the MCP server.

**Vault-optional fallback.** When no vault exists, tools fall back to Helius transaction history for analytics and advisory-mode enforcement. Agents can start without any on-chain setup.

**Machine-readable output.** Analytics returns structured `directives[]` (e.g., `{ type: "avoid_market", severity: "warning", params: { market: "PUMP_FUN" } }`) that agents can consume programmatically.

**Session state classification.** The coaching engine classifies agents into 5 states (normal, post_loss, tilt, hot_streak, post_lockout_recovery) and adjusts position sizing, trade limits, and market recommendations accordingly.

## On-Chain Programs

| Program | Address | Purpose |
|---------|---------|---------|
| Vault | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | Risk enforcement vault |
| Drift | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | Perpetual futures (position reading) |

PDA seeds: `["vault", owner]` and `["trader_profile", authority]`

## Adapting to Other Chains

The business logic — calibration, session state, behavioral analytics, coaching, scoring, semantic routing — is chain-agnostic. Only four files in `src/lib/` are Solana-specific. Fork and replace them to target any exchange or chain:

| File | What to replace |
|------|----------------|
| `src/lib/vault-reader.ts` | Your chain's account / state reader |
| `src/lib/helius-client.ts` | Your exchange's trade history API |
| `src/lib/transaction-builder.ts` | Your chain's unsigned transaction builder |
| `src/lib/constants.ts` | Your program IDs, contract addresses, seeds |

Everything in `quant-engine.ts`, `session-store.ts`, `scoring.ts`, `reranker.ts`, and all `src/tools/` stays the same.

### Advisory Mode (no chain required)

14 of 19 tools run entirely on in-memory session state — no wallet, no RPC, no API keys needed. Useful for testing, CEX agents, or any context where on-chain state isn't available.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `@solana/kit` | Modern Solana RPC + PDA derivation |
| `@solana/web3.js` | Transaction building |
| `zod` | Runtime input validation |

## License

MIT
