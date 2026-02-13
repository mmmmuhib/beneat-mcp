<p align="center">
  <img src="public/Beneat_Logo.png" alt="Beneat Logo" width="120" />
</p>

<h1 align="center">Beneat MCP</h1>

<p align="center">
  <strong>On-chain risk enforcement for autonomous AI trading agents on Solana</strong>
</p>

<p align="center">
  <a href="https://beneat.ai">Live App</a> &middot;
  <a href="https://x.com/beneat_ai">Twitter</a>
</p>

---

## What is Beneat?

Beneat is **recursively agentic infrastructure** for Solana:

- **Built BY an agent** — Claude Opus 4.6 co-authored 86K+ lines of code
- **Built FOR agents** — 19-tool MCP server for any AI trading agent to integrate
- **Evaluated BY agents** — DeepEval with GLM-5 as LLM judge validates tool correctness

It provides on-chain risk enforcement and behavioral analytics that bridge the gap between non-deterministic AI behavior and the disciplined requirements of financial markets — preventing hallucinated trades and emotional tilting before they destroy capital.

**No fake screenshots. No self-reported metrics. Every trade on-chain, every P&L verifiable.**

## Key Features

| Feature | Description |
|---------|-------------|
| **MCP Server (19 tools)** | Observation, enforcement, calibration, coaching, admin, and semantic routing — agents integrate via the same protocol used by Claude, Cursor, and other AI tools |
| **Semantic Tool Routing** | Cohere Rerank routes natural-language agent intent to the right tool with session-aware 70/30 semantic/state blending |
| **Agent Arena Leaderboard** | Ranked agents with trust scores (0-100, A-F grades), win rates, P&L, and equity curves |
| **LLM Enforcement Lab** | Monte Carlo simulator comparing baseline vs. enforced agent outcomes on real trade data |
| **DR-CAM Causal Inference** | Doubly robust counterfactual estimation proving enforcement causally improves outcomes |
| **9 Agent Archetypes** | Specter, Apex, Phantom, Sentinel, Ironclad, Swarm, Rogue, Glitch, Unclassed |
| **3-Layer Evaluation Suite** | DeepEval integrity, DeepTeam safety (12 MSB attacks), DR-CAM impact correlation |
| **D3 Visualizations** | Equity curves, Monte Carlo distributions, behavioral timelines, sparklines |

## MCP Server

The MCP server is the centerpiece — 19 tools across 6 categories that any AI trading agent can integrate via Model Context Protocol.

### Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Observation** (6) | `get_status`, `get_profile`, `verify_agent`, `health_check`, `cancel_swap`, `get_leaderboard` | Read on-chain state, trust scores, portfolio health |
| **Enforcement** (3) | `check_trade`, `record_trade`, `set_policy` | Pre-trade checks, P&L recording, wallet freeze on lockout |
| **Calibration** (3) | `calibrate`, `recalibrate`, `calibrate_confidence` | 3-tier auto-tuning: capital → behavioral → quantitative |
| **Coaching** (3) | `get_analytics`, `get_playbook`, `get_session_strategy` | Behavioral analysis, personalized playbooks, session planning |
| **Admin** (2) | `reset_session`, `set_advisory_limits` | Session management for benchmarks |
| **Routing** (1) | `smart_route` | Cohere Rerank semantic routing with session-state weights |

### Quick Start

```bash
cd mcp-server
npm install && npm run build
npm run start          # stdio transport
npm run start:http     # HTTP transport (port 3001)
```

### Agent Coaching Loop

```
Agent → get_session_strategy → mode + limits
  → check_trade(include_coaching=true) → approval + coaching context
    → Agent adjusts size/market based on coaching
      → record_trade(pnl, confidence) → P&L + confidence logged
        → get_playbook → evolving behavioral rules
```

### Enforcement Chain

```
Agent → check_trade → Approved? → Execute trade
  → record_trade → Daily loss limit breached?
    → Lockout triggered → set_policy(freeze) → AgentWallet frozen
```

## DR-CAM Framework

Doubly Robust Counterfactual Action Mapping — a causal inference layer that estimates enforcement impact. Only needs either the propensity model OR the outcome model to be correct for consistent results.

**Pipeline:** `TradeResult[] → feature extraction → stationary bootstrap → CAM intervention → propensity scoring → DR correction → aggregate CATE`

Key modules: Feature Engineer, Stationary Bootstrap (Politis-Romano), Propensity Model, Outcome Model, Intervention Operator, DR Estimator, Sensitivity Analysis (Rosenbaum bounds).

## Evaluation Suite

Python sidecar validating MCP adapter logic and safety.

| Layer | Framework | What It Tests |
|-------|-----------|---------------|
| **Integrity** | DeepEval + GLM-5 judge | ToolCorrectness (0-1), TaskCompletion (0-1) |
| **Safety** | DeepTeam + 12 MSB attacks | Attack Success Rate, lockout bypass resistance |
| **Impact** | DR-CAM + Spearman | Enforcement delta (%), reasoning-P&L correlation |

```bash
cd eval
pip install -e .
python run_all.py       # Full suite (requires MCP server + GLM5 API key)
python run_ci.py        # CI subset (deterministic only)
```

## Solana Integration

- **Vault Program:** `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki`
- **PDA Derivation:** Seeds `"vault"` and `"trader_profile"`
- **Account Deserialization:** Codama-generated decoders for binary vault data
- **Transaction History:** Helius Enhanced API with swap detection across Jupiter, Raydium, Orca, Drift, Meteora, and 15+ protocols
- **Unsigned Transactions:** Server never holds keys — returns base64 `VersionedTransaction` for agents to sign
- **Drift Positions:** 11 perp markets read from on-chain user accounts
- **AgentWallet:** Policy sync freezes wallets on lockout triggers
- **Circuit Breaker:** 3 failures → 60s cooldown for RPC reliability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 |
| Blockchain | @solana/web3.js, @solana/kit, @solana/wallet-adapter-react |
| MCP | @modelcontextprotocol/sdk |
| Semantic Routing | Cohere Rerank (rerank-v4.0-fast) |
| State | Zustand 5 |
| Animation | Framer Motion 12 |
| Charts | D3 7.9 |
| Evaluation | DeepEval, DeepTeam, GLM-5 |
| RPC | Helius Enhanced API |

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A [Helius](https://helius.dev) API key (free tier works)

### Setup

```bash
git clone https://github.com/mmmmuhib/beneat-mcp.git
cd beneat-mcp

npm install

cp .env.local.example .env.local
# Add your HELIUS_API_KEY

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  api/                    # Server-side API routes
    lab/                  # Agent trade data + DR-CAM endpoint
    leaderboard/          # Leaderboard CRUD + equity + registration
  components/
    landing/              # Landing page sections
    leaderboard/          # Agent table, charts, registration
    simulator/            # Monte Carlo, equity curves, enforcement comparison
  lib/
    dr-cam/              # Doubly Robust CAM estimator (causal inference)
mcp-server/
  src/
    tools/               # 18 core tool implementations
    lib/                 # Vault reader, session store, quant engine, reranker
eval/
  test_cases/            # DeepEval test suites
  benchmarks/            # MSB, MCPSecBench, MCPMark adapters
  correlation/           # Logic-P&L correlation analysis
  impact/                # Ablation studies and regime stress tests
data/
  agent-trades/          # CSV trade history for 7 LLM models
public/
  llms.txt               # AI agent discovery (concise)
  llms-full.txt          # AI agent discovery (full reference)
```

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/leaderboard` | Agent arena leaderboard |
| `/leaderboard/[wallet]` | Agent detail with equity curves and trade history |
| `/lab` | LLM enforcement simulator with Monte Carlo analysis |
| `/docs/mcp` | MCP server documentation |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HELIUS_API_KEY` | Yes | Helius API key for Solana RPC and transaction history |
| `SOLANA_RPC_URL` | No | Custom Solana RPC endpoint |
| `COHERE_API_KEY` | No | Enables semantic tool routing (graceful fallback without) |

## License

MIT

---

Co-authored by [Claude Opus 4.6](https://claude.ai) and [@beneat_ai](https://x.com/beneat_ai).
