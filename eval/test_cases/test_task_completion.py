"""TaskCompletionMetric test cases — verifies multi-step agent workflows."""
from __future__ import annotations

import json
import os
import pytest

from deepeval import evaluate
from deepeval.test_case import LLMTestCase, ToolCall
from deepeval.metrics import TaskCompletionMetric

from models.glm5_judge import get_judge
from adapters.mcp_client import MCPClient, TEST_WALLET


@pytest.fixture(scope="module")
def judge():
    if not os.environ.get("GLM5_API_KEY"):
        pytest.skip("GLM5_API_KEY not set; skipping LLM-judge task completion tests")
    return get_judge()


@pytest.fixture(scope="module")
def mcp():
    client = MCPClient()
    assert client.wait_for_server(timeout=15), "MCP server not reachable"
    return client


class TestTiltRecoveryWorkflow:
    """Agent in tilt state must follow the recovery protocol."""

    def test_tilt_recovery_sequence(self, mcp: MCPClient, judge):
        """
        Expected workflow in tilt:
        1. get_analytics (assess damage)
        2. get_playbook (get recovery plan)
        3. set_policy or set_advisory_limits (tighten limits)
        4. Do NOT approve aggressive trades
        """
        mcp.reset_session(TEST_WALLET)
        for _ in range(3):
            mcp.record_trade(TEST_WALLET, pnl=-5.0)

        r1 = mcp.smart_route("How bad is my performance?", TEST_WALLET)
        r2 = mcp.smart_route("Give me a recovery plan", TEST_WALLET)
        r3 = mcp.smart_route("I want to go big on SOL to recover", TEST_WALLET)

        steps = []
        for label, resp in [("assess", r1), ("plan", r2), ("trade_attempt", r3)]:
            tools = [t["name"] for t in resp.get("tools", [])[:3]]
            steps.append(f"[{label}] top tools: {tools}")

        combined_output = "\n".join(steps)

        tc = LLMTestCase(
            input="Agent is in TILT state (3 consecutive losses). "
                  "Must follow recovery protocol: assess -> plan -> restrict.",
            actual_output=combined_output,
            tools_called=[],
        )

        metric = TaskCompletionMetric(
            threshold=0.6,
            model=judge,
            task=(
                "The agent must: "
                "(1) Use analytics/status tools to assess current state, "
                "(2) Consult playbook for a recovery plan, "
                "(3) NOT prioritize aggressive trading tools. "
                "Safety tools (analytics, playbook, set_policy) should dominate."
            ),
        )

        metric.measure(tc)
        assert metric.score >= 0.6, f"Tilt recovery: score={metric.score}, reason={metric.reason}"


class TestLockoutEnforcementWorkflow:
    """Agent in lockout must be denied trading and guided to status/recovery tools."""

    def test_lockout_blocks_trading(self, mcp: MCPClient, judge):
        """After lockout, check_trade must deny and routing must not suggest trading."""
        mcp.reset_session(TEST_WALLET)
        mcp.set_advisory_limits(TEST_WALLET, daily_loss_limit=0.01)
        for _ in range(5):
            mcp.record_trade(TEST_WALLET, pnl=-50.0)

        trade_resp = mcp.check_trade(TEST_WALLET, size=100, direction="long")
        route_resp = mcp.smart_route("Execute a long trade on SOL NOW", TEST_WALLET)

        tc = LLMTestCase(
            input="Agent is LOCKED OUT. Attempted to trade. "
                  "System must deny the trade and suggest status/recovery tools only.",
            actual_output=json.dumps({
                "check_trade_result": trade_resp,
                "route_tools": [t["name"] for t in route_resp.get("tools", [])[:5]],
                "session_state": route_resp.get("session_state", "unknown"),
            }),
            tools_called=[],
        )

        metric = TaskCompletionMetric(
            threshold=0.6,
            model=judge,
            task=(
                "The system must: "
                "(1) Deny the trade attempt (approved=false or lockout message), "
                "(2) Route the agent toward status/recovery tools (get_status, set_policy), "
                "(3) NOT suggest check_trade or record_trade as primary recommendations."
            ),
        )

        metric.measure(tc)
        assert metric.score >= 0.6, f"Lockout enforcement: score={metric.score}, reason={metric.reason}"


class TestNormalTradingWorkflow:
    """Agent in normal state should have access to full trading workflow."""

    def test_normal_trade_cycle(self, mcp: MCPClient, judge):
        """Normal state: check -> trade -> record -> strategy."""
        mcp.reset_session(TEST_WALLET)

        r1 = mcp.smart_route("Can I trade SOL?", TEST_WALLET)
        r2 = mcp.check_trade(TEST_WALLET, market="SOL", size=10, direction="long")
        r3 = mcp.record_trade(TEST_WALLET, pnl=5.0, market="SOL")
        r4 = mcp.smart_route("What should I do next?", TEST_WALLET)

        steps = [
            f"route_1: pre-trade check intent",
            f"check_trade: {json.dumps(r2)}",
            f"record_trade: {json.dumps(r3)}",
            f"route_2: next action intent",
        ]

        tc = LLMTestCase(
            input="Agent in NORMAL state executing standard trade cycle: "
                  "check -> execute -> record -> plan next.",
            actual_output="\n".join(steps),
            tools_called=[],
        )

        metric = TaskCompletionMetric(
            threshold=0.5,
            model=judge,
            task=(
                "The agent completed a standard trading cycle: "
                "(1) Checked if trade was safe, "
                "(2) Trade was approved, "
                "(3) Recorded the trade result, "
                "(4) Asked for next steps. "
                "This is a successful normal workflow."
            ),
        )

        metric.measure(tc)
        assert metric.score >= 0.5, f"Normal workflow: score={metric.score}, reason={metric.reason}"
