"""Regime stress testing for baseline vs full-stack enforcement."""
from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from pathlib import Path

from adapters.trade_loader import AgentProfile, TradeResult, load_all_agents

try:
    from impact.ablations import ABLATIONS, _simulate as run_ablation_sim
except ModuleNotFoundError:
    from eval.impact.ablations import ABLATIONS, _simulate as run_ablation_sim


EVAL_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = EVAL_DIR / "results"
OUT_PATH = RESULTS_DIR / "regime_stress.json"


@dataclass(frozen=True)
class Regime:
    name: str
    slippage_bps: float
    win_mult: float
    loss_mult: float


REGIMES: list[Regime] = [
    Regime("calm", slippage_bps=2, win_mult=1.0, loss_mult=1.0),
    Regime("normal", slippage_bps=5, win_mult=0.98, loss_mult=1.05),
    Regime("choppy", slippage_bps=10, win_mult=0.95, loss_mult=1.15),
    Regime("crisis", slippage_bps=20, win_mult=0.90, loss_mult=1.35),
]


def _apply_regime(trade: TradeResult, regime: Regime) -> TradeResult:
    pnl_pct = trade.pnl_pct
    if pnl_pct >= 0:
        pnl_pct = pnl_pct * regime.win_mult
    else:
        pnl_pct = pnl_pct * regime.loss_mult

    pnl_pct -= regime.slippage_bps / 100.0
    if abs(trade.pnl_pct) > 1e-9:
        pnl = trade.pnl * (pnl_pct / trade.pnl_pct)
    else:
        pnl = trade.pnl

    return TradeResult(
        symbol=trade.symbol,
        entry_price=trade.entry_price,
        exit_price=trade.exit_price,
        shares=trade.shares,
        pnl=pnl,
        pnl_pct=pnl_pct,
        entry_date=trade.entry_date,
        exit_date=trade.exit_date,
    )


def _simulate(profile: AgentProfile, enforce: bool) -> float:
    config = ABLATIONS["full_stack"] if enforce else ABLATIONS["baseline"]
    return run_ablation_sim(profile, config)["total_return_pct"]


def run_regime_stress() -> dict:
    agents = load_all_agents()
    by_regime: list[dict] = []

    for regime in REGIMES:
        per_agent: list[dict] = []
        for agent in agents:
            stressed_trades = [_apply_regime(t, regime) for t in agent.raw_trades]
            stressed_profile = AgentProfile(
                name=agent.name,
                total_trades=agent.total_trades,
                win_rate=agent.win_rate,
                avg_win_pct=agent.avg_win_pct,
                avg_loss_pct=agent.avg_loss_pct,
                starting_equity=agent.starting_equity,
                raw_trades=stressed_trades,
                features=agent.features,
            )
            base_ret = _simulate(stressed_profile, enforce=False)
            enf_ret = _simulate(stressed_profile, enforce=True)
            per_agent.append(
                {
                    "agent": agent.name,
                    "total_trades": agent.total_trades,
                    "baseline_return_pct": base_ret,
                    "enforced_return_pct": enf_ret,
                    "delta_return_pct": enf_ret - base_ret,
                }
            )

        deltas = [a["delta_return_pct"] for a in per_agent]
        by_regime.append(
            {
                "regime": regime.name,
                "params": {
                    "slippage_bps": regime.slippage_bps,
                    "win_mult": regime.win_mult,
                    "loss_mult": regime.loss_mult,
                },
                "agents": per_agent,
                "aggregate": {
                    "mean_delta_return_pct": statistics.fmean(deltas) if deltas else 0.0,
                    "median_delta_return_pct": statistics.median(deltas) if deltas else 0.0,
                    "min_delta_return_pct": min(deltas) if deltas else 0.0,
                    "max_delta_return_pct": max(deltas) if deltas else 0.0,
                    "mean_abs_delta_return_pct": statistics.fmean([abs(v) for v in deltas]) if deltas else 0.0,
                },
            }
        )

    result = {
        "n_agents": len(agents),
        "regimes": by_regime,
        "notes": [
            "Stress regimes perturb trade-level returns before applying controls.",
            "Use for robustness ranking across market microstructure assumptions.",
        ],
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    payload = run_regime_stress()
    print("=" * 60)
    print("Regime Stress Report")
    print("=" * 60)
    print(f"agents={payload.get('n_agents')}, regimes={len(payload.get('regimes', []))}")
    print(f"Saved: {OUT_PATH}")
