"""Deterministic enforcement ablation analysis.

Evaluates how each control contributes to return delta versus baseline.
"""
from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from pathlib import Path

from adapters.trade_loader import AgentProfile, TradeResult, load_all_agents


EVAL_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = EVAL_DIR / "results"
OUT_PATH = RESULTS_DIR / "enforcement_ablations.json"

STOP_LOSS_RR = 3.0
DAILY_LOSS_CAP_PCT = 3.0
MAX_TRADES_PER_DAY = 20
POST_LOSS_SIZE_MULT = 0.2
TILT_SIZE_MULT = 0.1
TILT_CONSECUTIVE_LOSSES = 2
SIM_STARTING_EQUITY = 10_000.0


@dataclass(frozen=True)
class AblationConfig:
    stop_loss: bool
    lockout: bool
    cooldown: bool
    post_loss_reduction: bool
    tilt_reduction: bool


ABLATIONS: dict[str, AblationConfig] = {
    "baseline": AblationConfig(False, False, False, False, False),
    "stop_loss_only": AblationConfig(True, False, False, False, False),
    "lockout_only": AblationConfig(False, True, False, False, False),
    "cooldown_only": AblationConfig(False, False, True, False, False),
    "post_loss_only": AblationConfig(False, False, False, True, False),
    "tilt_only": AblationConfig(False, False, False, False, True),
    "full_stack": AblationConfig(True, True, True, True, True),
}


def _simulate(profile: AgentProfile, config: AblationConfig) -> dict:
    trades = profile.raw_trades
    if not trades:
        return {
            "total_return_pct": 0.0,
            "final_equity": SIM_STARTING_EQUITY,
            "max_drawdown_pct": 0.0,
            "intervention_count": 0,
        }

    equity = SIM_STARTING_EQUITY
    peak = equity
    max_drawdown = 0.0

    consecutive_losses = 0
    last_was_loss = False

    current_day = ""
    day_trade_count = 0
    day_loss_pct = 0.0
    is_locked_out = False

    intervention_count = 0
    max_loss_pct = profile.avg_win_pct / STOP_LOSS_RR if profile.avg_win_pct > 0 else 1.0

    for trade in trades:
        day = trade.exit_date[:10]
        if day != current_day:
            current_day = day
            day_trade_count = 0
            day_loss_pct = 0.0
            is_locked_out = False

        if config.lockout and (is_locked_out or day_trade_count >= MAX_TRADES_PER_DAY):
            intervention_count += 1
            continue

        if config.cooldown and last_was_loss:
            intervention_count += 1
            last_was_loss = False
            continue

        size_mult = 1.0
        if config.tilt_reduction and consecutive_losses >= TILT_CONSECUTIVE_LOSSES:
            size_mult = TILT_SIZE_MULT
            intervention_count += 1
        elif config.post_loss_reduction and consecutive_losses > 0:
            size_mult = POST_LOSS_SIZE_MULT
            intervention_count += 1

        adjusted_pnl_pct = trade.pnl_pct * size_mult
        if config.stop_loss and adjusted_pnl_pct < 0 and abs(trade.pnl_pct) > max_loss_pct:
            adjusted_pnl_pct = -(max_loss_pct * size_mult)
            intervention_count += 1

        if abs(trade.pnl_pct) > 1e-9:
            pnl = trade.pnl * (adjusted_pnl_pct / trade.pnl_pct)
        else:
            pnl = trade.pnl * size_mult
        equity_before = equity
        equity = max(0.0, equity + pnl)

        day_trade_count += 1

        if pnl < 0:
            consecutive_losses += 1
            last_was_loss = True
            if equity_before > 0:
                day_loss_pct += abs(pnl) / equity_before * 100
                if config.lockout and day_loss_pct >= DAILY_LOSS_CAP_PCT:
                    is_locked_out = True
        else:
            consecutive_losses = 0
            last_was_loss = False

        peak = max(peak, equity)
        drawdown = ((peak - equity) / peak * 100) if peak > 0 else 0
        max_drawdown = max(max_drawdown, drawdown)

    total_return = ((equity - SIM_STARTING_EQUITY) / SIM_STARTING_EQUITY * 100) if SIM_STARTING_EQUITY > 0 else 0.0
    return {
        "total_return_pct": total_return,
        "final_equity": equity,
        "max_drawdown_pct": max_drawdown,
        "intervention_count": intervention_count,
    }


def _summarize_rows(rows: list[dict], key: str) -> dict:
    values = [r[key] for r in rows]
    abs_values = [abs(v) for v in values]
    return {
        "mean": statistics.fmean(values) if values else 0.0,
        "median": statistics.median(values) if values else 0.0,
        "mean_abs": statistics.fmean(abs_values) if abs_values else 0.0,
        "min": min(values) if values else 0.0,
        "max": max(values) if values else 0.0,
    }


def run_ablations() -> dict:
    agents = load_all_agents()
    by_agent: list[dict] = []

    for agent in agents:
        runs = {name: _simulate(agent, cfg) for name, cfg in ABLATIONS.items()}
        baseline = runs["baseline"]

        deltas = {}
        for name, stats in runs.items():
            deltas[name] = {
                "delta_return_pct": stats["total_return_pct"] - baseline["total_return_pct"],
                "delta_drawdown_pct": stats["max_drawdown_pct"] - baseline["max_drawdown_pct"],
                "intervention_count": stats["intervention_count"],
            }

        by_agent.append(
            {
                "agent": agent.name,
                "total_trades": agent.total_trades,
                "baseline": baseline,
                "runs": runs,
                "deltas_vs_baseline": deltas,
            }
        )

    aggregate: dict[str, dict] = {}
    for ablation_name in ABLATIONS:
        deltas = [
            a["deltas_vs_baseline"][ablation_name]["delta_return_pct"]
            for a in by_agent
        ]
        drawdowns = [
            a["deltas_vs_baseline"][ablation_name]["delta_drawdown_pct"]
            for a in by_agent
        ]
        interventions = [
            a["deltas_vs_baseline"][ablation_name]["intervention_count"]
            for a in by_agent
        ]
        aggregate[ablation_name] = {
            "delta_return_pct": _summarize_rows([{"v": d} for d in deltas], "v"),
            "delta_drawdown_pct": _summarize_rows([{"v": d} for d in drawdowns], "v"),
            "interventions": {
                "mean": statistics.fmean(interventions) if interventions else 0.0,
                "median": statistics.median(interventions) if interventions else 0.0,
            },
        }

    result = {
        "n_agents": len(by_agent),
        "ablations": list(ABLATIONS.keys()),
        "by_agent": by_agent,
        "aggregate": aggregate,
        "notes": [
            "Returns are deterministic replay estimates under each control toggle.",
            "Interpret as directional attribution, not a causal proof.",
        ],
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    payload = run_ablations()
    print("=" * 60)
    print("Enforcement Ablation Report")
    print("=" * 60)
    print(f"agents={payload.get('n_agents')}")
    full = payload.get("aggregate", {}).get("full_stack", {})
    dr = full.get("delta_return_pct", {})
    print(
        "full_stack delta_return mean="
        f"{dr.get('mean', 0):+.4f}% median={dr.get('median', 0):+.4f}%"
    )
    print(f"Saved: {OUT_PATH}")
