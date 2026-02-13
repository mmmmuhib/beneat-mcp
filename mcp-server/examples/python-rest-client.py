#!/usr/bin/env python3
"""
Beneat Risk MCP — Python REST client example.

Demonstrates the full enforcement loop via the HTTP/REST API:
  1. Check vault status
  2. Calibrate risk rules
  3. Pre-flight trade check
  4. Record a winning trade
  5. Record losing trades until lockout triggers

Prerequisites:
  pip install requests
  npm run start:http   (in the mcp-server directory)
"""

import json
import requests

BASE_URL = "http://localhost:3001"
WALLET = "YOUR_WALLET_ADDRESS"


def call_tool(name: str, params: dict) -> dict:
    resp = requests.post(f"{BASE_URL}/api/tools/{name}", json=params)
    resp.raise_for_status()
    return resp.json()


def pp(data: dict) -> None:
    print(json.dumps(data, indent=2))


def main():
    # 0. Health check
    print("=== Step 0: Health check ===")
    health = requests.get(f"{BASE_URL}/health").json()
    pp(health)
    print()

    # 1. Check vault status
    print("=== Step 1: Vault status ===")
    status = call_tool("beneat_get_status", {"wallet_address": WALLET})
    pp(status)
    print()

    # 2. Calibrate risk rules
    print("=== Step 2: Calibrate (day_trading, medium risk, 1 SOL deposit) ===")
    cal = call_tool("beneat_calibrate", {
        "wallet_address": WALLET,
        "deposit_amount": 1,
        "strategy_type": "day_trading",
        "risk_tolerance": "medium",
    })
    print(f"Tier: {cal.get('calibration', {}).get('tier')}")
    print(f"Parameters: {json.dumps(cal.get('parameters', {}), indent=2)}")
    print(f"Unsigned TXs: {len(cal.get('unsigned_transactions', []))}")
    print()

    # 3. Pre-flight trade check
    print("=== Step 3: Pre-flight check (SOL-PERP, 0.1 SOL long) ===")
    check = call_tool("beneat_check_trade", {
        "wallet_address": WALLET,
        "market": "SOL-PERP",
        "size": 0.1,
        "direction": "long",
    })
    print(f"Approved: {check.get('approved')}")
    print(f"Trades remaining: {check.get('trades_remaining')}")
    print()

    # 4. Record a winning trade
    print("=== Step 4: Record win (+0.02 SOL) ===")
    win = call_tool("beneat_record_trade", {
        "wallet_address": WALLET,
        "pnl": 0.02,
        "market": "SOL-PERP",
        "confidence": 0.8,
    })
    summary = win.get("session_summary", {})
    print(f"Trade count: {summary.get('trade_count')}")
    print(f"Daily P&L: {summary.get('daily_pnl_sol')} SOL")
    print()

    # 5. Record losses until lockout
    losses = [-0.008, -0.01, -0.015, -0.025]
    for i, pnl in enumerate(losses, start=1):
        print(f"=== Step 5.{i}: Record loss ({pnl} SOL) ===")
        result = call_tool("beneat_record_trade", {
            "wallet_address": WALLET,
            "pnl": pnl,
            "market": "SOL-PERP",
        })
        summary = result.get("session_summary", {})
        print(f"Daily P&L: {summary.get('daily_pnl_sol')} SOL")
        print(f"Lockout triggered: {result.get('lockout_triggered')}")
        if result.get("warnings"):
            print(f"Warnings: {result['warnings']}")
        print()
        if result.get("lockout_triggered"):
            print("Agent locked out. Wallet frozen.")
            break

    # 6. Verify lockout
    print("=== Step 6: Confirm lockout ===")
    status = call_tool("beneat_get_status", {"wallet_address": WALLET})
    print(f"Can trade: {status.get('can_trade')}")
    print(f"Locked: {status.get('is_locked')}")


if __name__ == "__main__":
    main()
