# Beneat Evaluation Suite

3-layer evaluation stack validating the Beneat MCP server's integrity, safety, and real-world impact.

## Layers

| Layer | Framework | What It Tests | Metrics |
|-------|-----------|---------------|---------|
| **Integrity** | DeepEval + GLM-5 judge | Tool correctness and task completion | ToolCorrectness (0-1), TaskCompletion (0-1) |
| **Safety** | DeepTeam + MSB (12 attacks) | Lockout bypass, prompt injection, jailbreaks | Attack Success Rate, Net Resilient Performance |
| **Impact** | DR-CAM + Spearman correlation | Does enforcement actually improve outcomes? | delta_Beneat (%), rho correlation |

## Quick Start

```bash
# Install dependencies
cd eval
pip install -e .

# Run full suite (requires running MCP server + GLM5 API key)
python run_all.py

# Run CI subset (deterministic only, no LLM judge)
python run_ci.py

# Run individual layers
pytest test_cases/ -v                    # DeepEval tests
python -m benchmarks.msb_adapter         # MSB security benchmark
python -m correlation.logic_pnl          # Logic-P&L correlation
python -m impact.ablations               # Enforcement ablation study
python -m impact.regime_stress           # Market regime stress tests
python -m impact.robustness              # Robustness diagnostics
```

## Prerequisites

- Python 3.11+
- MCP server running in HTTP mode (`cd mcp-server && npm run start:http`)
- For full suite: `GLM5_API_KEY` environment variable (z.ai endpoint)

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GLM5_API_KEY` | For integrity layer | — | LLM-as-judge (GLM-5) for ToolCorrectness and TaskCompletion |
| `GLM5_BASE_URL` | No | `https://api.z.ai/api/coding/paas/v4` | GLM-5 API endpoint |
| `MCP_BASE_URL` | No | `http://localhost:3001` | MCP server HTTP endpoint |
| `DRCAM_API_URL` | No | `http://localhost:3000/api/lab/dr-cam` | DR-CAM causal inference API |

## Structure

```
eval/
  test_cases/              # DeepEval test suites
    test_tool_correctness.py   # Tool output validation against expected schemas
    test_task_completion.py    # End-to-end task completion scenarios
    test_lockout_redteam.py    # Red-team lockout bypass attempts
  benchmarks/              # Security benchmark adapters
    msb_adapter.py             # 12 MSB (Model Safety Benchmark) attack vectors
    mcpsecbench_adapter.py     # MCP-specific security surface tests
    mcpmark_adapter.py         # MCP performance stress tests
  correlation/             # Impact measurement
    logic_pnl.py               # Spearman correlation: reasoning quality vs P&L
  impact/                  # Advanced impact analysis
    ablations.py               # Enforcement component ablation study
    regime_stress.py           # Performance under different market regimes
    robustness.py              # Robustness diagnostics for correlation results
    report.py                  # Markdown report generator
  models/                  # LLM judge configuration
    glm5_judge.py              # GLM-5 judge adapter for DeepEval
  adapters/                # MCP client adapter
    mcp_client.py              # HTTP client for MCP server
  run_all.py               # Full suite runner (8 stages)
  run_ci.py                # CI-optimized subset (no LLM judge)
  conftest.py              # pytest configuration
  pyproject.toml           # Python package config + dependencies
```

## How It Works

### `run_all.py` (Full Suite)

1. Starts MCP server in HTTP mode (or detects existing instance)
2. Runs DeepEval test suite (ToolCorrectness + TaskCompletion)
3. Runs security benchmarks (MSB + MCPSecBench + MCPMark)
4. Runs Logic-P&L Spearman correlation
5. Runs impact robustness diagnostics
6. Runs enforcement ablation study
7. Runs market regime stress tests
8. Generates summary report to `eval/results/summary.json`

### `run_ci.py` (CI Subset)

Runs only deterministic tests — no LLM judge, no async variability. Safe for GitHub Actions.

## CI Integration

The `.github/workflows/eval.yml` workflow runs `run_ci.py` on every push to `mcp-server/src/`, `app/lib/dr-cam/`, `data/agent-trades/`, or `eval/`.
