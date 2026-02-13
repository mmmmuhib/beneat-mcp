"""Load agent trade CSV data and engineer features (Python port of DR-CAM feature-engineer.ts)."""
from __future__ import annotations

import csv
import math
import os
from dataclasses import dataclass, field
from datetime import datetime
from collections import OrderedDict
from pathlib import Path
from typing import Literal

# Path to agent trade CSVs relative to project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
AGENT_TRADES_DIR = PROJECT_ROOT / "data" / "agent-trades"
COMPETITION_END_ISO = os.environ.get("ARENA_COMPETITION_END_ISO", "2025-12-11T23:59:59.999Z")

SessionState = Literal["normal", "post_loss", "tilt", "hot_streak", "post_lockout_recovery"]
TradeDirection = Literal["entry_long", "entry_short", "exit_long", "exit_short"]


@dataclass
class TradeResult:
    symbol: str
    entry_price: float
    exit_price: float
    shares: float
    pnl: float
    pnl_pct: float
    entry_date: str
    exit_date: str


@dataclass
class TradeFeatures:
    consecutive_losses: int
    equity_drawdown_pct: float
    trades_today: int
    session_state: SessionState
    realized_vol: float
    hour_of_day: int
    day_of_week: int
    symbol: str
    direction: TradeDirection
    position_size_pct: float


@dataclass
class AgentProfile:
    name: str
    total_trades: int
    win_rate: float
    avg_win_pct: float
    avg_loss_pct: float
    starting_equity: float
    raw_trades: list[TradeResult] = field(default_factory=list)
    features: list[TradeFeatures] = field(default_factory=list)


def _parse_csv(csv_path: Path) -> list[dict]:
    """Parse a Hyperliquid trade CSV into row dicts."""
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _parse_iso_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _filter_rows_by_cutoff(rows: list[dict], cutoff_iso: str) -> list[dict]:
    cutoff_dt = _parse_iso_ts(cutoff_iso)
    if cutoff_dt is None:
        return rows

    filtered: list[dict] = []
    for row in rows:
        ts = _parse_iso_ts(row.get("filled_at", ""))
        if ts is None or ts <= cutoff_dt:
            filtered.append(row)
    return filtered


def _pair_trades(rows: list[dict]) -> list[TradeResult]:
    """FIFO trade pairing — matches opens to closes by symbol."""
    open_lots: dict[str, list[dict]] = {}
    trades: list[TradeResult] = []

    for row in rows:
        symbol = row["symbol"]
        direction = row.get("dir", row.get("reason", ""))

        if "Open" in direction:
            open_lots.setdefault(symbol, []).append(row)
        elif "Close" in direction and symbol in open_lots and open_lots[symbol]:
            entry_row = open_lots[symbol].pop(0)
            entry_price = float(entry_row["price"])
            exit_price = float(row["price"])
            shares = float(row["shares"])
            pnl = float(row.get("closed_pnl", 0))
            # PnL as percentage of entry notional
            notional = shares * entry_price
            pnl_pct = (pnl / notional * 100) if notional > 0 else 0

            trades.append(TradeResult(
                symbol=symbol,
                entry_price=entry_price,
                exit_price=exit_price,
                shares=shares,
                pnl=pnl,
                pnl_pct=pnl_pct,
                entry_date=entry_row["filled_at"],
                exit_date=row["filled_at"],
            ))

    return trades


def _coalesce_hl_rows(rows: list[dict]) -> list[dict]:
    """Coalesce split fills that belong to the same execution event.

    Hyperliquid user fills are execution-level and often contain multiple rows
    for one logical close/open event at identical timestamp/symbol/dir/price.
    """
    grouped: OrderedDict[tuple[str, str, str, str], dict] = OrderedDict()

    for row in rows:
        key = (
            row.get("filled_at", ""),
            row.get("symbol", ""),
            row.get("side", ""),
            row.get("dir", ""),
        )

        if key not in grouped:
            grouped[key] = dict(row)
            continue

        existing = grouped[key]
        for num_key in ("shares", "amount", "closed_pnl", "fee"):
            try:
                existing_val = float(existing.get(num_key, 0) or 0)
                row_val = float(row.get(num_key, 0) or 0)
                existing[num_key] = str(existing_val + row_val)
            except Exception:
                pass

    return list(grouped.values())


def _pair_trades_hl(rows: list[dict]) -> list[TradeResult]:
    """Parse Hyperliquid fills into realized trade events.

    Mirrors matchTradesHL logic from app/lib/trade-analyzer.ts with an
    additional coalescing step for split fills.
    """
    sorted_rows = sorted(rows, key=lambda r: r.get("filled_at", ""))
    rows_merged = _coalesce_hl_rows(sorted_rows)

    positions: dict[str, float] = {}
    trades: list[TradeResult] = []
    epsilon = 1e-10

    for row in rows_merged:
        symbol = row.get("symbol", "")
        direction = row.get("dir", "")
        price = float(row.get("price", 0) or 0)
        shares = float(row.get("shares", 0) or 0)
        closed_pnl = float(row.get("closed_pnl", 0) or 0)
        timestamp = row.get("filled_at", "")

        pos = positions.get(symbol, 0.0)

        if direction == "Open Long":
            positions[symbol] = pos + shares
            continue

        if direction == "Open Short":
            positions[symbol] = pos - shares
            continue

        if direction in ("Close Long", "Close Short"):
            if shares > epsilon:
                is_long = direction == "Close Long"
                entry_price = (price - closed_pnl / shares) if is_long else (price + closed_pnl / shares)
                pnl_pct = (closed_pnl / (shares * entry_price) * 100) if entry_price > 0 else 0.0
                trades.append(
                    TradeResult(
                        symbol=symbol,
                        entry_price=entry_price,
                        exit_price=price,
                        shares=shares,
                        pnl=closed_pnl,
                        pnl_pct=pnl_pct,
                        entry_date=timestamp,
                        exit_date=timestamp,
                    )
                )

            positions[symbol] = pos - shares if direction == "Close Long" else pos + shares
            continue

        if direction in ("Long > Short", "Short > Long"):
            closing_shares = max(pos, 0.0) if direction == "Long > Short" else max(-pos, 0.0)
            if closing_shares > epsilon:
                is_long = direction == "Long > Short"
                entry_price = (price - closed_pnl / closing_shares) if is_long else (price + closed_pnl / closing_shares)
                pnl_pct = (closed_pnl / (closing_shares * entry_price) * 100) if entry_price > 0 else 0.0
                trades.append(
                    TradeResult(
                        symbol=symbol,
                        entry_price=entry_price,
                        exit_price=price,
                        shares=closing_shares,
                        pnl=closed_pnl,
                        pnl_pct=pnl_pct,
                        entry_date=timestamp,
                        exit_date=timestamp,
                    )
                )

            positions[symbol] = pos - shares if direction == "Long > Short" else pos + shares

    return trades


def _infer_session_state(
    consecutive_losses: int, consecutive_wins: int, day_loss_pct: float
) -> SessionState:
    if day_loss_pct >= 3:
        return "post_lockout_recovery"
    if consecutive_losses >= 3:
        return "tilt"
    if consecutive_losses >= 1:
        return "post_loss"
    if consecutive_wins >= 3:
        return "hot_streak"
    return "normal"


def _infer_direction(trade: TradeResult) -> TradeDirection:
    is_long = trade.exit_price >= trade.entry_price
    if trade.pnl >= 0:
        return "exit_long" if is_long else "exit_short"
    return "entry_short" if is_long else "entry_long"


def _rolling_vol(returns: list[float], index: int, window: int = 20) -> float:
    start = max(0, index - window)
    sl = returns[start:index]
    if len(sl) < 2:
        return 0.0
    mean = sum(sl) / len(sl)
    variance = sum((v - mean) ** 2 for v in sl) / (len(sl) - 1)
    return math.sqrt(variance)


def engineer_features(trades: list[TradeResult], starting_equity: float) -> list[TradeFeatures]:
    """Port of feature-engineer.ts engineerFeatures()."""
    if not trades:
        return []

    features: list[TradeFeatures] = []
    returns: list[float] = []

    consecutive_losses = 0
    consecutive_wins = 0
    equity = starting_equity
    peak = equity
    current_day = ""
    trades_today = 0
    day_loss_pct = 0.0

    for i, trade in enumerate(trades):
        trade_day = trade.exit_date[:10]

        if trade_day != current_day:
            current_day = trade_day
            trades_today = 0
            day_loss_pct = 0.0

        if equity > peak:
            peak = equity
        equity_drawdown_pct = ((peak - equity) / peak * 100) if peak > 0 else 0

        vol = _rolling_vol(returns, i)

        try:
            exit_dt = datetime.fromisoformat(trade.exit_date.replace("Z", "+00:00"))
            hour_of_day = exit_dt.hour
            day_of_week = exit_dt.weekday()  # 0=Monday in Python
        except Exception:
            hour_of_day = 0
            day_of_week = 0

        direction = _infer_direction(trade)

        position_value = trade.shares * trade.entry_price
        position_size_pct = (position_value / equity * 100) if equity > 0 else 0

        session_state = _infer_session_state(consecutive_losses, consecutive_wins, day_loss_pct)

        features.append(TradeFeatures(
            consecutive_losses=consecutive_losses,
            equity_drawdown_pct=equity_drawdown_pct,
            trades_today=trades_today,
            session_state=session_state,
            realized_vol=vol,
            hour_of_day=hour_of_day,
            day_of_week=day_of_week,
            symbol=trade.symbol,
            direction=direction,
            position_size_pct=position_size_pct,
        ))

        trade_return = trade.pnl_pct / 100
        returns.append(trade_return)

        if trade.pnl < 0:
            consecutive_losses += 1
            consecutive_wins = 0
            day_loss_pct += abs(trade.pnl) / equity * 100 if equity > 0 else 0
        else:
            consecutive_losses = 0
            consecutive_wins += 1

        equity += trade.pnl
        trades_today += 1

    return features


def load_agent_profile(csv_path: Path) -> AgentProfile:
    """Load a single agent profile from a CSV file."""
    rows = _parse_csv(csv_path)
    has_hl_dir = any((r.get("dir") or "").strip() for r in rows)
    if has_hl_dir:
        rows = _filter_rows_by_cutoff(rows, COMPETITION_END_ISO)

    trades = _pair_trades_hl(rows) if has_hl_dir else _pair_trades(rows)

    if not trades:
        return AgentProfile(name=csv_path.stem, total_trades=0, win_rate=0,
                            avg_win_pct=0, avg_loss_pct=0, starting_equity=10000)

    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    win_rate = len(wins) / len(trades) if trades else 0
    avg_win_pct = sum(t.pnl_pct for t in wins) / len(wins) if wins else 0
    avg_loss_pct = sum(abs(t.pnl_pct) for t in losses) / len(losses) if losses else 0

    # Estimate starting equity from first trade notional * 10
    starting_equity = trades[0].shares * trades[0].entry_price * 10 if trades else 10000

    if has_hl_dir and trades:
        total_fees = 0.0
        for row in rows:
            try:
                total_fees += float(row.get("fee", 0) or 0)
            except Exception:
                pass

        if total_fees > 0:
            total_notional = sum(t.shares * t.exit_price for t in trades)
            for trade in trades:
                trade_notional = trade.shares * trade.exit_price
                fee_portion = total_fees * (trade_notional / total_notional) if total_notional > 0 else 0.0
                trade.pnl -= fee_portion
                trade.pnl_pct = (trade.pnl / (trade.shares * trade.entry_price) * 100) if trade.entry_price > 0 else 0.0

    features = engineer_features(trades, starting_equity)

    name = csv_path.stem
    # Clean up name: "hyperliquid-gpt-5-1-trade-history-2026-02-10" -> "gpt-5-1"
    for prefix in ["hyperliquid-", "maximumreturnswithwebsearch"]:
        if name.startswith(prefix):
            name = name[len(prefix):]
    name = name.split("-trade-history")[0]

    return AgentProfile(
        name=name,
        total_trades=len(trades),
        win_rate=win_rate,
        avg_win_pct=avg_win_pct,
        avg_loss_pct=avg_loss_pct,
        starting_equity=starting_equity,
        raw_trades=trades,
        features=features,
    )


def load_all_agents() -> list[AgentProfile]:
    """Load all Hyperliquid agent profiles from data/agent-trades/."""
    if not AGENT_TRADES_DIR.exists():
        return []
    csv_files = sorted(AGENT_TRADES_DIR.glob("*.csv"))
    profiles = []
    for f in csv_files:
        profile = load_agent_profile(f)
        if profile.total_trades > 0:
            profiles.append(profile)
    return profiles
