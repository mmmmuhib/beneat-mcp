"""HTTP client for Beneat MCP server (localhost:3001).

Uses the REST API:
  POST /api/tools/:name  — call individual tools (body = tool arguments)
  POST /api/route        — smart route (body = {intent, wallet_address, top_n})
  GET  /health           — health check
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx


MCP_BASE_URL = os.environ.get("MCP_BASE_URL", "http://localhost:3001")
TEST_WALLET = "BeneatTestWa11etForEva1uat1on11111111111111111"


class MCPClient:
    """Thin wrapper around the MCP server's REST API."""

    def __init__(self, base_url: str = MCP_BASE_URL, timeout: float = 30.0):
        self.base_url = base_url
        self.client = httpx.Client(timeout=timeout)

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict:
        """Call an MCP tool via POST /api/tools/:name."""
        resp = self.client.post(
            f"{self.base_url}/api/tools/{name}",
            json=arguments or {},
        )
        resp.raise_for_status()
        return resp.json()

    def call_tool_safe(self, name: str, arguments: dict[str, Any] | None = None) -> dict:
        """Call a tool, returning error dict instead of raising on 4xx/5xx."""
        try:
            resp = self.client.post(
                f"{self.base_url}/api/tools/{name}",
                json=arguments or {},
            )
            if resp.status_code >= 400:
                return {"error": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text}
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def smart_route(
        self, intent: str, wallet: str = TEST_WALLET, top_n: int = 5
    ) -> dict:
        """Call POST /api/route for ranked tool recommendations."""
        resp = self.client.post(
            f"{self.base_url}/api/route",
            json={
                "intent": intent,
                "wallet_address": wallet,
                "top_n": top_n,
            },
        )
        resp.raise_for_status()
        return resp.json()

    def check_trade(
        self, wallet: str = TEST_WALLET, market: str = "SOL", size: float = 10,
        direction: str = "long", include_coaching: bool = True,
    ) -> dict:
        """Call beneat_check_trade."""
        return self.call_tool("beneat_check_trade", {
            "wallet_address": wallet,
            "market": market,
            "size": size,
            "direction": direction,
            "include_coaching": include_coaching,
        })

    def record_trade(
        self, wallet: str = TEST_WALLET, pnl: float = 0,
        market: str = "SOL", confidence: float | None = None,
    ) -> dict:
        """Call beneat_record_trade."""
        args: dict[str, Any] = {
            "wallet_address": wallet,
            "pnl": pnl,
            "market": market,
        }
        if confidence is not None:
            args["confidence"] = confidence
        return self.call_tool("beneat_record_trade", args)

    def set_advisory_limits(
        self, wallet: str = TEST_WALLET,
        daily_loss_limit: float = 0.03,
        max_trades: int = 20,
        cooldown_ms: int = 120000,
    ) -> dict:
        """Call beneat_set_advisory_limits."""
        return self.call_tool("beneat_set_advisory_limits", {
            "wallet_address": wallet,
            "daily_loss_limit": daily_loss_limit,
            "max_trades": max_trades,
            "cooldown_ms": cooldown_ms,
        })

    def reset_session(self, wallet: str = TEST_WALLET) -> dict:
        """Call beneat_reset_session."""
        return self.call_tool("beneat_reset_session", {
            "wallet_address": wallet,
        })

    def get_analytics(self, wallet: str = TEST_WALLET) -> dict:
        """Call beneat_get_analytics."""
        return self.call_tool("beneat_get_analytics", {
            "wallet_address": wallet,
        })

    def health_check(self) -> bool:
        """Check if the MCP server is running."""
        try:
            resp = self.client.get(f"{self.base_url}/health")
            return resp.status_code == 200
        except httpx.ConnectError:
            return False

    def wait_for_server(self, timeout: float = 15.0, poll_interval: float = 0.5) -> bool:
        """Wait for the MCP server to become ready."""
        start = time.time()
        while time.time() - start < timeout:
            if self.health_check():
                return True
            time.sleep(poll_interval)
        return False
