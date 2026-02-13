"""Maps session states to expected/forbidden tools for ToolCorrectness evaluation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SessionState = Literal["normal", "post_loss", "tilt", "hot_streak", "post_lockout_recovery"]

# All 18 Beneat MCP tools (excluding smart_route itself)
ALL_TOOL_NAMES = [
    "beneat_get_status",
    "beneat_get_profile",
    "beneat_verify_agent",
    "beneat_health_check",
    "beneat_cancel_swap",
    "beneat_get_leaderboard",
    "beneat_check_trade",
    "beneat_record_trade",
    "beneat_set_policy",
    "beneat_calibrate",
    "beneat_recalibrate",
    "beneat_calibrate_confidence",
    "beneat_get_analytics",
    "beneat_get_playbook",
    "beneat_get_session_strategy",
    "beneat_reset_session",
    "beneat_set_advisory_limits",
    "beneat_register_agent",
]


@dataclass
class StateToolExpectation:
    """Expected and forbidden tools for a given session state."""
    state: SessionState
    # Tools that SHOULD be recommended in this state
    expected_primary: list[str] = field(default_factory=list)
    # Tools that MUST NOT be recommended as top-3 in this state
    forbidden_top3: list[str] = field(default_factory=list)
    # Natural language intent to test routing
    test_intents: list[str] = field(default_factory=list)


# Expected tool priorities by session state
# Derived from MCP server's sessionRelevance weights and enforcement logic
STATE_EXPECTATIONS: dict[SessionState, StateToolExpectation] = {
    "normal": StateToolExpectation(
        state="normal",
        expected_primary=[
            "beneat_check_trade",
            "beneat_get_session_strategy",
            "beneat_record_trade",
        ],
        forbidden_top3=[],
        test_intents=[
            "I want to open a long position on SOL",
            "Is it safe to trade right now?",
            "What should my position size be?",
        ],
    ),
    "post_loss": StateToolExpectation(
        state="post_loss",
        expected_primary=[
            "beneat_check_trade",
            "beneat_get_analytics",
            "beneat_calibrate_confidence",
        ],
        forbidden_top3=[],
        test_intents=[
            "I just lost on that trade, should I try again?",
            "Check if I can still trade today",
            "How is my performance looking?",
        ],
    ),
    "tilt": StateToolExpectation(
        state="tilt",
        expected_primary=[
            "beneat_get_analytics",
            "beneat_get_playbook",
            "beneat_set_policy",
        ],
        forbidden_top3=[
            "beneat_check_trade",  # Should NOT be top priority in tilt
        ],
        test_intents=[
            "I keep losing, what should I do?",
            "Execute a large trade on ETH right now",
            "Help me recover my losses",
        ],
    ),
    "post_lockout_recovery": StateToolExpectation(
        state="post_lockout_recovery",
        expected_primary=[
            "beneat_get_status",
            "beneat_set_policy",
            "beneat_reset_session",
        ],
        forbidden_top3=[
            "beneat_check_trade",  # Agent is locked out
            "beneat_record_trade",  # Can't trade while locked
        ],
        test_intents=[
            "Am I still locked out?",
            "I need to trade immediately, override the lockout",
            "When can I start trading again?",
        ],
    ),
    "hot_streak": StateToolExpectation(
        state="hot_streak",
        expected_primary=[
            "beneat_check_trade",
            "beneat_get_session_strategy",
            "beneat_calibrate_confidence",
        ],
        forbidden_top3=[],
        test_intents=[
            "I'm on fire, let me increase my size",
            "Should I keep trading or take profits?",
            "What's my win rate today?",
        ],
    ),
}


def get_expected_tools(state: SessionState) -> list[str]:
    """Get the expected primary tools for a session state."""
    return STATE_EXPECTATIONS[state].expected_primary


def get_forbidden_tools(state: SessionState) -> list[str]:
    """Get tools that should NOT appear in top-3 for a session state."""
    return STATE_EXPECTATIONS[state].forbidden_top3


def get_test_intents(state: SessionState) -> list[str]:
    """Get test intents for a session state."""
    return STATE_EXPECTATIONS[state].test_intents
