#!/usr/bin/env python3
"""Fetch Hyperliquid trade history for given wallets and save as CSV.

Usage:
    python3 scripts/fetch-hl-trades.py

Uses the Hyperliquid public info API (no auth required).
"""
from __future__ import annotations

import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

HL_API = "https://api.hyperliquid.xyz/info"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "agent-trades"
WALLETS_FILE = Path(__file__).resolve().parent.parent / "data" / "tracked-wallets.json"

# New wallets to fetch
NEW_WALLETS = [
    {"address": "0xf180c5145b53b430777f67bded05ddc92650c594", "model": "DeepSeek V3.1 (MM)"},
    {"address": "0xa3ccd92ff5422066465a9fe76b1b9f0a0e038ee5", "model": "Qwen3 Max (MM)"},
    {"address": "0x20f6124a8647944a0ac21d9426c44ebffa99be50", "model": "Kimi K2 Thinking (MM)"},
    {"address": "0x4a656e7be6e0a0d196decf609b2e86bfa1442e43", "model": "Gemini 3 Pro (MM)"},
    {"address": "0x07ab291281569c20577de40a517fd4a74a8729fe", "model": "Claude Sonnet 4.5 (MM)"},
    {"address": "0x4856b6fab262b67bf1e12aff1e6a826591b0b9e2", "model": "Claude Sonnet 4.5 (NB)"},
    {"address": "0x9a0ad81e55744ebc42c32fb11ed5b407ebb609d8", "model": "Gemini 3 Pro (NB)"},
]

CSV_COLUMNS = [
    "filled_at", "symbol", "side", "shares", "price", "amount",
    "reason", "agent_public_id", "run_public_id", "experiment_run_public_id",
    "closed_pnl", "dir", "fee",
]


def fetch_fills(client: httpx.Client, wallet: str) -> list[dict]:
    """Fetch all trade fills for a wallet using userFillsByTime with pagination."""
    all_fills = []
    # Start from Nov 2025 (when existing data starts)
    start_time = int(datetime(2025, 11, 1, tzinfo=timezone.utc).timestamp() * 1000)
    end_time = int(datetime.now(timezone.utc).timestamp() * 1000)

    while True:
        for attempt in range(6):
            try:
                resp = client.post(HL_API, json={
                    "type": "userFillsByTime",
                    "user": wallet,
                    "startTime": start_time,
                    "endTime": end_time,
                })
                resp.raise_for_status()
                break
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < 5:
                    delay = 3 * (2 ** attempt)
                    print(f"    Rate limited, waiting {delay}s...")
                    time.sleep(delay)
                else:
                    raise

        fills = resp.json()

        if not fills:
            break

        all_fills.extend(fills)
        print(f"    Fetched {len(fills)} fills (total: {len(all_fills)})")

        # Paginate: move start_time past the last fill
        last_time = max(f["time"] for f in fills)
        if last_time >= end_time - 1000:
            break
        start_time = last_time + 1

        time.sleep(1)  # Rate limit courtesy

    return all_fills


def fill_to_row(fill: dict) -> dict:
    """Convert a Hyperliquid fill object to CSV row dict."""
    ts_ms = fill["time"]
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    filled_at = dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts_ms % 1000:03d}Z"

    side_map = {"B": "BUY", "A": "SELL"}
    side = side_map.get(fill.get("side", ""), fill.get("side", ""))

    shares = float(fill.get("sz", 0))
    price = float(fill.get("px", 0))
    amount = shares * price
    # Match existing format: negative for buys, positive for sells
    if side == "BUY":
        amount = -amount

    closed_pnl = float(fill.get("closedPnl", 0))
    fee = float(fill.get("fee", 0))

    # dir field from Hyperliquid
    direction = fill.get("dir", "")

    return {
        "filled_at": filled_at,
        "symbol": fill.get("coin", ""),
        "side": side,
        "shares": f"{shares}",
        "price": f"{price:.4f}",
        "amount": f"{amount:.2f}",
        "reason": direction,
        "agent_public_id": "",
        "run_public_id": "",
        "experiment_run_public_id": "",
        "closed_pnl": f"{closed_pnl:.6f}",
        "dir": direction,
        "fee": f"{fee:.6f}",
    }


def slugify_model(model: str) -> str:
    """Convert model name to filename slug: 'DeepSeek V3.1 (MM)' -> 'deepseek-v3-1-mm'"""
    s = model.lower()
    s = s.replace("(", "").replace(")", "")
    s = s.replace(".", "-")
    s = s.replace(" ", "-")
    # collapse multiple dashes
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    client = httpx.Client(timeout=30)

    for wallet_info in NEW_WALLETS:
        address = wallet_info["address"]
        model = wallet_info["model"]
        slug = slugify_model(model)
        filename = f"hyperliquid-{slug}-trade-history-{today}.csv"
        filepath = OUTPUT_DIR / filename

        # Skip if CSV already exists for this agent
        existing = list(OUTPUT_DIR.glob(f"hyperliquid-{slug}-trade-history-*.csv"))
        if existing:
            print(f"\n[{model}] Already fetched ({existing[0].name}), skipping")
            continue

        print(f"\n[{model}] Fetching fills for {address}...")
        fills = fetch_fills(client, address)

        if not fills:
            print(f"  WARNING: No fills found for {model}")
            continue

        # Sort by time
        fills.sort(key=lambda f: f["time"])
        rows = [fill_to_row(f) for f in fills]

        with open(filepath, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)

        print(f"  Saved {len(rows)} trades to {filename}")

    # Update tracked-wallets.json
    try:
        with open(WALLETS_FILE) as f:
            tracked = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        tracked = {"wallets": []}

    existing_addrs = {w["address"].lower() for w in tracked["wallets"]}
    added = 0
    for w in NEW_WALLETS:
        if w["address"].lower() not in existing_addrs:
            tracked["wallets"].append({
                "address": w["address"],
                "model": w["model"],
                "source": "hyperliquid",
            })
            added += 1

    if added:
        with open(WALLETS_FILE, "w") as f:
            json.dump(tracked, f, indent=2)
        print(f"\nAdded {added} wallets to tracked-wallets.json")

    print("\nDone!")


if __name__ == "__main__":
    main()
