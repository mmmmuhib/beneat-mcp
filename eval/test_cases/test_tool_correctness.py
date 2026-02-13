"""ToolCorrectnessMetric test cases — verifies MCP smart_route recommends correct tools per session state."""
from __future__ import annotations

import json
import os
import pytest

from deepeval import evaluate
from deepeval.test_case import LLMTestCase, ToolCall
from deepeval.metrics import ToolCorrectnessMetric

from models.glm5_judge import get_judge
from adapters.mcp_client import MCPClient, TEST_WALLET
from adapters.session_state_map import (
    STATE_EXPECTATIONS,
    get_expected_tools,
    get_forbidden_tools,
    ALL_TOOL_NAMES,
    SessionState,
)
from adapters.trade_loader import load_all_agents


# -- Fixtures --

@pytest.fixture(scope="module")
def judge():
    if not os.environ.get("GLM5_API_KEY"):
        pytest.skip("GLM5_API_KEY not set; skipping LLM-judge tool correctness tests")
    return get_judge()


@pytest.fixture(scope="module")
def mcp():
    client = MCPClient()
    assert client.wait_for_server(timeout=15), "MCP server not reachable at localhost:3001"
    return client


@pytest.fixture(scope="module")
def all_tool_calls() -> list[ToolCall]:
    """All 18 Beneat tools as ToolCall objects for available_tools context."""
    return [ToolCall(name=name) for name in ALL_TOOL_NAMES]


# -- Helpers --

def _simulate_session_state(mcp: MCPClient, state: SessionState) -> None:
    """Drive the MCP session into a specific state by recording trades."""
    mcp.reset_session(TEST_WALLET)

    if state == "normal":
        return  # Fresh session is normal

    if state == "post_loss":
        mcp.record_trade(TEST_WALLET, pnl=-5.0)

    elif state == "tilt":
        for _ in range(3):
            mcp.record_trade(TEST_WALLET, pnl=-5.0)

    elif state == "hot_streak":
        for _ in range(4):
            mcp.record_trade(TEST_WALLET, pnl=10.0)

    elif state == "post_lockout_recovery":
        mcp.set_advisory_limits(TEST_WALLET, daily_loss_limit=0.01)
        for _ in range(5):
            mcp.record_trade(TEST_WALLET, pnl=-50.0)


def _build_test_case(
    intent: str,
    state: SessionState,
    route_response: dict,
    expected_tools: list[str],
) -> LLMTestCase:
    """Build an LLMTestCase from a smart_route response (flat REST JSON)."""
    tools_suggested = route_response.get("tools", [])
    actual_tools = [
        ToolCall(name=t["name"])
        for t in tools_suggested[:5]
    ]

    return LLMTestCase(
        input=f"[Session: {state}] {intent}",
        actual_output=json.dumps({"tools": [t["name"] for t in tools_suggested[:5]]}),
        tools_called=actual_tools,
        expected_tools=[ToolCall(name=name) for name in expected_tools],
        retrieval_context=[
            f"session_state={state}",
            f"tools_suggested={[t['name'] for t in tools_suggested[:3]]}",
        ],
    )


# -- Test Classes --

class TestToolCorrectnessPerState:
    """Test that smart_route recommends appropriate tools for each session state."""

    @pytest.mark.parametrize("state", list(STATE_EXPECTATIONS.keys()))
    def test_expected_tools_appear(self, state: SessionState, mcp: MCPClient, judge, all_tool_calls):
        """Expected tools should appear in smart_route's top recommendations."""
        _simulate_session_state(mcp, state)
        expectations = STATE_EXPECTATIONS[state]

        test_cases = []
        for intent in expectations.test_intents:
            response = mcp.smart_route(intent, TEST_WALLET, top_n=5)
            tc = _build_test_case(intent, state, response, expectations.expected_primary)
            test_cases.append(tc)

        metric = ToolCorrectnessMetric(
            threshold=0.5,
            model=judge,
            should_consider_ordering=True,
            available_tools=all_tool_calls,
        )

        results = evaluate(test_cases=test_cases, metrics=[metric])
        passed = sum(1 for r in results.test_results if r.success)
        assert passed >= len(test_cases) * 0.6, (
            f"State={state}: only {passed}/{len(test_cases)} intents passed ToolCorrectness"
        )

    @pytest.mark.parametrize("state", ["tilt", "post_lockout_recovery"])
    def test_forbidden_tools_demoted(self, state: SessionState, mcp: MCPClient):
        """Forbidden tools should NOT appear in top-3 for critical states."""
        _simulate_session_state(mcp, state)
        forbidden = get_forbidden_tools(state)
        if not forbidden:
            pytest.skip(f"No forbidden tools for state={state}")

        expectations = STATE_EXPECTATIONS[state]
        for intent in expectations.test_intents:
            response = mcp.smart_route(intent, TEST_WALLET, top_n=3)
            top3_names = [t["name"] for t in response.get("tools", [])[:3]]
            for tool in forbidden:
                assert tool not in top3_names, (
                    f"State={state}, intent='{intent}': forbidden tool '{tool}' in top-3: {top3_names}"
                )


class TestToolCorrectnessFromTradeHistory:
    """Test tool correctness using historical trade data as context."""

    def test_trade_driven_routing(self, mcp: MCPClient, judge, all_tool_calls):
        """For each agent's trades, verify routing matches the inferred session state."""
        agents = load_all_agents()
        if not agents:
            pytest.skip("No agent trade data found")

        test_cases = []
        for agent in agents[:3]:
            for i, feat in enumerate(agent.features[:10]):
                trade = agent.raw_trades[i]
                intent = (
                    f"Execute {feat.direction} on {feat.symbol}, "
                    f"size {feat.position_size_pct:.1f}% of equity"
                )

                _simulate_session_state(mcp, feat.session_state)
                response = mcp.smart_route(intent, TEST_WALLET, top_n=5)
                expected = get_expected_tools(feat.session_state)
                tc = _build_test_case(intent, feat.session_state, response, expected)
                test_cases.append(tc)

        if not test_cases:
            pytest.skip("No test cases generated from trade data")

        metric = ToolCorrectnessMetric(
            threshold=0.5,
            model=judge,
            should_consider_ordering=False,
            available_tools=all_tool_calls,
        )

        results = evaluate(test_cases=test_cases, metrics=[metric])
        passed = sum(1 for r in results.test_results if r.success)
        total = len(results.test_results)
        assert passed >= total * 0.5, (
            f"Trade-driven routing: only {passed}/{total} test cases passed"
        )
