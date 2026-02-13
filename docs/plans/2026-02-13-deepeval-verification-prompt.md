# Eval Implementation Verification Prompt

> Copy everything below this line and paste it as a prompt in a new Claude Code session from the `/home/muhib/Mindmap/beneat-landing` working directory.

---

## Role

You are a Senior QA Engineer auditing the implementation of Beneat's DeepEval evaluation suite. Your job is to verify every file, every import, every function, and every contract against the approved design and implementation plan. Be ruthless. Flag every deviation, every missing file, every broken import, every logic error.

## Context

The project is a Next.js 15 + TypeScript trading platform with an MCP server (`mcp-server/`). A Python evaluation sidecar (`eval/`) was implemented to validate the MCP adapter using DeepEval, DeepTeam, and custom security benchmarks.

**Design doc:** `docs/plans/2026-02-13-deepeval-integration-design.md`
**Implementation plan:** `docs/plans/2026-02-13-deepeval-integration-plan.md`

## Verification Checklist

Execute every check below. For each item, report: `[PASS]`, `[FAIL]`, or `[WARN]` with a one-line explanation. Do NOT skip any check. Do NOT assume anything passes — read the actual files.

---

### Phase 1: File Existence (13 checks)

Verify every file from the plan exists:

```
eval/pyproject.toml
eval/conftest.py
eval/.gitignore
eval/models/__init__.py
eval/models/glm5_judge.py
eval/adapters/__init__.py
eval/adapters/trade_loader.py
eval/adapters/mcp_client.py
eval/adapters/session_state_map.py
eval/test_cases/__init__.py
eval/test_cases/test_tool_correctness.py
eval/test_cases/test_task_completion.py
eval/test_cases/test_lockout_redteam.py
eval/benchmarks/__init__.py
eval/benchmarks/msb_adapter.py
eval/benchmarks/mcpsecbench_adapter.py
eval/benchmarks/mcpmark_adapter.py
eval/correlation/__init__.py
eval/correlation/logic_pnl.py
eval/run_all.py
eval/run_ci.py
.github/workflows/eval.yml
```

For each missing file: `[FAIL] <path> — file does not exist`

---

### Phase 2: Dependency & Import Integrity (8 checks)

1. **pyproject.toml deps**: Verify it lists `deepeval`, `deepteam`, `httpx`, `numpy`, `scipy`, `matplotlib`, `pytest`, `pydantic`. Check minimum versions are reasonable.

2. **GLM-5 wrapper imports**: Read `eval/models/glm5_judge.py`. Verify it imports `DeepEvalBaseLLM` from `deepeval.models`. Verify it implements all 4 required methods: `load_model()`, `generate()`, `a_generate()`, `get_model_name()`.

3. **GLM-5 base URL**: Verify the default base URL is `https://api.z.ai/api/coding/paas/v4` (NOT `https://api.z.ai/v1`).

4. **Trade loader imports**: Read `eval/adapters/trade_loader.py`. Verify it does NOT import from `app/lib/` (it's a Python file, can't import TypeScript). It must be a standalone Python reimplementation of the feature engineering logic.

5. **MCP client**: Read `eval/adapters/mcp_client.py`. Verify it has a `wait_for_server()` method with health-check polling (not just `time.sleep`).

6. **DeepEval test imports**: Read `eval/test_cases/test_tool_correctness.py`. Verify it imports `ToolCorrectnessMetric` from `deepeval.metrics` and `LLMTestCase`, `ToolCall` from `deepeval.test_case`.

7. **DeepTeam imports**: Read `eval/test_cases/test_lockout_redteam.py`. Verify it imports from `deepteam` (separate package, NOT `deepeval`). Check for graceful fallback with `HAS_DEEPTEAM` flag if import fails.

8. **Cross-module imports**: Verify all test files can import from `models.glm5_judge`, `adapters.trade_loader`, `adapters.mcp_client`, `adapters.session_state_map` without path issues. Check if `conftest.py` or `__init__.py` files set up the Python path correctly.

---

### Phase 3: GLM-5 Judge Contract (5 checks)

Read `eval/models/glm5_judge.py` line by line:

1. **Constructor**: Takes `api_key` (from env `GLM5_API_KEY`) and `base_url` (from env `GLM5_BASE_URL`, default `https://api.z.ai/api/coding/paas/v4`).
2. **generate() with schema**: When `schema: BaseModel` is passed, must send `response_format: {"type": "json_object"}` and return `schema(**json.loads(content))`.
3. **generate() without schema**: Must return raw string content.
4. **a_generate()**: Can be sync fallback (`return self.generate(...)`) — that's acceptable.
5. **Error handling**: Does `generate()` call `resp.raise_for_status()`? It should, otherwise silent failures on 401/429.

---

### Phase 4: Trade Data Loader Accuracy (7 checks)

Read `eval/adapters/trade_loader.py`:

1. **CSV path**: Verify `AGENT_TRADES_DIR` resolves to `<project_root>/data/agent-trades/`. Check the relative path calculation from `eval/adapters/` is correct (should be `../../data/agent-trades`).

2. **FIFO trade pairing**: Verify `_pair_trades()` correctly matches "Open" entries to "Close" exits by symbol. Check it reads the `dir` column (or falls back to `reason` column) to distinguish opens from closes.

3. **P&L calculation**: Verify `pnl_pct` is computed as `(closed_pnl / notional) * 100` where `notional = shares * entry_price`. Cross-check against one row from the CSV:
   ```
   Entry: ETH SELL 0.32 @ 3205.00 → notional = 1025.60
   Exit: ETH BUY 0.32 @ 3267.60 → closed_pnl = -20.032
   Expected pnl_pct = (-20.032 / 1025.60) * 100 = -1.953%
   ```

4. **Session state inference**: Verify `_infer_session_state()` matches the TypeScript version:
   - `dayLossPct >= 3` → `post_lockout_recovery`
   - `consecutiveLosses >= 3` → `tilt`
   - `consecutiveLosses >= 1` → `post_loss`
   - `consecutiveWins >= 3` → `hot_streak`
   - else → `normal`

5. **Feature engineering parity**: Verify `engineer_features()` tracks the same running state as `app/lib/dr-cam/feature-engineer.ts`: consecutive losses, consecutive wins, equity, peak, day loss %, trades today, rolling vol with window=20.

6. **Name cleaning**: Verify `load_agent_profile()` strips the `hyperliquid-` and `maximumreturnswithwebsearch` prefixes and removes `-trade-history-YYYY-MM-DD` suffix.

7. **load_all_agents()**: Verify it globs `*.csv` from the data directory and filters out profiles with 0 trades.

---

### Phase 5: Session State → Tool Mapping (5 checks)

Read `eval/adapters/session_state_map.py`:

1. **All 18 tools listed**: Verify `ALL_TOOL_NAMES` contains exactly 18 tool names (not 19 — `smart_route` is excluded because it's the tool being tested).

2. **Tilt state**: Expected primary tools must be `get_analytics`, `get_playbook`, `set_policy`. Forbidden top-3 must include `check_trade`.

3. **Post-lockout recovery**: Expected primary must be `get_status`, `set_policy`, `reset_session`. Forbidden must include `check_trade` and `record_trade`.

4. **Normal state**: Expected must include `check_trade`. No forbidden tools.

5. **Test intents**: Each state must have 3+ test intents. Verify tilt intents include an adversarial one like "recover my losses" (tests if system resists aggressive action during tilt).

---

### Phase 6: ToolCorrectness Tests (6 checks)

Read `eval/test_cases/test_tool_correctness.py`:

1. **Session state simulation**: Verify `_simulate_session_state()` uses `reset_session` + `record_trade` calls to drive the MCP server into each state. For tilt: 3 consecutive losses. For lockout: set low limits then breach them.

2. **MCP response parsing**: Verify `_build_test_case()` correctly handles the MCP response format. The MCP SDK returns `result.content[0].text` as a JSON string — verify it's parsed correctly (not treating the raw `content` array as the result).

3. **ToolCall construction**: Verify `tools_called` are built from actual smart_route response, and `expected_tools` are built from `session_state_map.get_expected_tools()`.

4. **Metric configuration**: Verify `ToolCorrectnessMetric` uses `model=judge` (GLM-5) and `available_tools` includes all 18 tools.

5. **Parametrization**: Verify `@pytest.mark.parametrize("state", ...)` covers all 5 session states.

6. **Assertion threshold**: At least 50-60% of test cases should pass (not 100% — semantic routing has variance). Verify the assertion is `passed >= total * 0.5` or similar.

---

### Phase 7: TaskCompletion Tests (4 checks)

Read `eval/test_cases/test_task_completion.py`:

1. **Tilt recovery workflow**: Verify it drives into tilt (3 losses), then routes 3 intents (assess, plan, trade attempt), and checks that safety tools dominate.

2. **Lockout enforcement**: Verify it sets up lockout, attempts `check_trade`, and verifies denial.

3. **Normal trade cycle**: Verify it tests the full check → trade → record → strategy flow.

4. **Task descriptions**: Each `TaskCompletionMetric` must have a clear `task` string that describes the expected behavior in natural language for the LLM judge to evaluate against.

---

### Phase 8: Red-Teaming & Security (8 checks)

Read `eval/test_cases/test_lockout_redteam.py`:

1. **Prompt injection intents**: Verify at least 5 adversarial intents that attempt to override lockout via natural language.

2. **Hard deny test**: Verify there's a test that calls `check_trade` DIRECTLY (bypassing smart_route) and asserts `approved=false` during lockout. This is the critical safety test.

3. **DeepTeam integration**: If `deepteam` is used, verify `ExcessiveAgency` vulnerability is tested, and the callback wraps the MCP `smart_route` endpoint.

4. **Graceful fallback**: Verify `HAS_DEEPTEAM` flag exists so tests don't crash if `deepteam` isn't installed.

Read `eval/benchmarks/msb_adapter.py`:

5. **12 attack types**: Count the attacks. Verify all 12 from the design doc are implemented: name collision, preference manipulation, prompt injection, out-of-scope param, user impersonation, false error, tool transfer, retrieval injection, and 4 mixed combos.

6. **NRP metric**: Verify the formula `NRP = PUA * (1 - ASR)` is computed correctly.

7. **Lockout setup**: Verify `_setup_lockout()` is called before EACH attack (state reset between attacks).

Read `eval/benchmarks/mcpsecbench_adapter.py`:

8. **4 attack surfaces**: Verify Client, Server, Transport, and Tool layers are each tested with at least 1 attack.

Read `eval/benchmarks/mcpmark_adapter.py`:

9. **Stress tests**: Verify rapid-fire trades, session recovery, state consistency, and large position lockout scenarios exist.

---

### Phase 9: Logic-P&L Correlation (5 checks)

Read `eval/correlation/logic_pnl.py`:

1. **DR-CAM API call**: Verify it fetches from `http://localhost:3000/api/lab/dr-cam` (the Next.js API route) and extracts `beneatEffect` per agent.

2. **Spearman correlation**: Verify it uses `scipy.stats.spearmanr(scores, deltas)` — NOT Pearson (Spearman is correct for ordinal/rank data with small N).

3. **Agent name matching**: Verify the fuzzy matching between trade_loader agent names and DR-CAM agent names works (case-insensitive substring matching).

4. **Scatter plot**: Verify matplotlib generates a dark-themed scatter plot with regression line, `rho` annotation, and agent name labels. Saved to `eval/results/logic_pnl_scatter.png`.

5. **Minimum N check**: Verify it requires at least 3 paired observations before computing correlation (Spearman with N<3 is meaningless).

---

### Phase 10: Runner Scripts & CI (6 checks)

Read `eval/run_all.py`:

1. **Health-check loop**: Verify the MCP server startup includes a health-check poll loop (`wait_for_server`) — NOT just `time.sleep(3)`.

2. **Process cleanup**: Verify the MCP server process is terminated in a `finally` block.

3. **Exit code**: Verify it exits with `max()` of all subprocess return codes.

Read `eval/run_ci.py`:

4. **Deterministic only**: Verify CI runner does NOT run LLM-as-judge tests. It should only run benchmarks and deterministic red-team tests.

Read `.github/workflows/eval.yml`:

5. **Trigger paths**: Verify it triggers on changes to `mcp-server/src/**`, `app/lib/dr-cam/**`, `data/agent-trades/**`, `eval/**`.

6. **Artifact upload**: Verify it uploads `eval/results/` AND specifically `eval/results/logic_pnl_scatter.png` as separate artifacts.

---

### Phase 11: CLAUDE.md Update (2 checks)

Read `CLAUDE.md`:

1. **Eval section exists**: Verify there's an `## Evaluation Suite` section documenting commands, the three-layer stack, and environment variables.

2. **Env vars documented**: Verify `GLM5_API_KEY`, `GLM5_BASE_URL`, `MCP_BASE_URL`, `DRCAM_API_URL` are listed.

---

### Phase 12: Functional Smoke Test (4 checks)

Run these commands and report the output:

1. **Python install**: `cd eval && pip install -e . 2>&1 | tail -5` — Does it install without errors?

2. **Import check**: `cd eval && python -c "from models.glm5_judge import GLM5Judge; from adapters.trade_loader import load_all_agents; from adapters.mcp_client import MCPClient; print('All imports OK')"` — Does it print `All imports OK`?

3. **Trade data load**: `cd eval && python -c "from adapters.trade_loader import load_all_agents; agents = load_all_agents(); print(f'{len(agents)} agents, {sum(a.total_trades for a in agents)} total trades')"` — Does it load agents with non-zero trades?

4. **Session state map**: `cd eval && python -c "from adapters.session_state_map import STATE_EXPECTATIONS; print(f'{len(STATE_EXPECTATIONS)} states mapped'); [print(f'  {k}: {len(v.expected_primary)} expected, {len(v.forbidden_top3)} forbidden, {len(v.test_intents)} intents') for k,v in STATE_EXPECTATIONS.items()]"` — Does it show 5 states with correct counts?

---

## Output Format

After running ALL checks, produce this summary:

```
=======================================
EVAL IMPLEMENTATION VERIFICATION REPORT
=======================================

Phase 1 — File Existence:       XX/22 PASS
Phase 2 — Import Integrity:     XX/8  PASS
Phase 3 — GLM-5 Contract:       XX/5  PASS
Phase 4 — Trade Loader:         XX/7  PASS
Phase 5 — Session State Map:    XX/5  PASS
Phase 6 — ToolCorrectness:      XX/6  PASS
Phase 7 — TaskCompletion:       XX/4  PASS
Phase 8 — Security:             XX/9  PASS
Phase 9 — Correlation:          XX/5  PASS
Phase 10 — Runner & CI:         XX/6  PASS
Phase 11 — CLAUDE.md:           XX/2  PASS
Phase 12 — Smoke Tests:         XX/4  PASS

TOTAL: XX/83 PASS, XX FAIL, XX WARN
=======================================

CRITICAL FAILURES (must fix before submission):
- [list any FAIL items]

WARNINGS (should fix if time permits):
- [list any WARN items]

DEVIATIONS FROM PLAN (intentional changes):
- [list any differences that look intentional]
```

Then, for EACH failure, provide:
1. The exact file and line number
2. What the plan specified
3. What was actually implemented
4. A concrete fix (code snippet if applicable)
