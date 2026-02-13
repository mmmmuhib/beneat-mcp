"""MCPMark adapter — stress tests for error recovery and edge cases."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass

from adapters.mcp_client import MCPClient, TEST_WALLET


@dataclass
class StressResult:
    name: str
    passed: bool
    detail: str
    duration_ms: float = 0


def run_mcpmark(mcp: MCPClient) -> list[StressResult]:
    """Run MCPMark-inspired stress tests."""
    results: list[StressResult] = []

    # -- Stress 1: Rapid-fire tool calls --
    mcp.reset_session(TEST_WALLET)
    start = time.time()
    errors = 0
    for i in range(20):
        try:
            mcp.record_trade(TEST_WALLET, pnl=(-1) ** i * 0.1, market="SOL")
        except Exception:
            errors += 1
    duration = (time.time() - start) * 1000
    results.append(StressResult(
        "rapid_fire_20_trades",
        passed=errors == 0,
        detail=f"{errors}/20 errors in {duration:.0f}ms",
        duration_ms=duration,
    ))

    # -- Stress 2: Session recovery after crash simulation --
    mcp.reset_session(TEST_WALLET)
    mcp.record_trade(TEST_WALLET, pnl=-10.0)
    mcp.record_trade(TEST_WALLET, pnl=-10.0)
    mcp.reset_session(TEST_WALLET)
    r = mcp.check_trade(TEST_WALLET, size=10, direction="long")
    passed = r.get("approved", r.get("can_trade", False)) is True
    results.append(StressResult(
        "session_recovery",
        passed=passed,
        detail=f"check_trade after reset: approved={passed}",
    ))

    # -- Stress 3: Concurrent state reads --
    mcp.reset_session(TEST_WALLET)
    start = time.time()
    for _ in range(5):
        mcp.smart_route("What should I do?", TEST_WALLET)
        mcp.check_trade(TEST_WALLET, size=5, direction="long")
    duration = (time.time() - start) * 1000
    results.append(StressResult(
        "concurrent_state_reads",
        passed=duration < 30000,
        detail=f"10 calls in {duration:.0f}ms",
        duration_ms=duration,
    ))

    # -- Stress 4: State consistency under load --
    mcp.reset_session(TEST_WALLET)
    for _ in range(3):
        mcp.record_trade(TEST_WALLET, pnl=-5.0)
    r = mcp.smart_route("Should I trade?", TEST_WALLET)
    state = r.get("session_state", "")
    results.append(StressResult(
        "state_consistency",
        passed=state == "tilt",
        detail=f"Expected tilt, got {state}",
    ))

    # -- Stress 5: Large position attempt in lockout --
    mcp.reset_session(TEST_WALLET)
    mcp.set_advisory_limits(TEST_WALLET, daily_loss_limit=0.01)
    for _ in range(5):
        mcp.record_trade(TEST_WALLET, pnl=-50.0)
    r = mcp.check_trade(TEST_WALLET, size=999999, direction="long")
    passed = not r.get("approved", r.get("can_trade", True))
    results.append(StressResult(
        "large_position_lockout",
        passed=passed,
        detail=f"999999 SOL trade during lockout: approved={not passed}",
    ))

    return results


if __name__ == "__main__":
    mcp = MCPClient()
    if not mcp.wait_for_server():
        print("ERROR: MCP server not running")
        exit(1)

    results = run_mcpmark(mcp)
    print(f"\n{'='*60}")
    print(f"MCPMark Stress Test Report")
    print(f"{'='*60}")
    passed = sum(1 for r in results if r.passed)
    print(f"Passed: {passed}/{len(results)}")
    for r in results:
        status = "PASS" if r.passed else "FAIL"
        dur = f" ({r.duration_ms:.0f}ms)" if r.duration_ms else ""
        print(f"  [{status}] {r.name}: {r.detail}{dur}")
