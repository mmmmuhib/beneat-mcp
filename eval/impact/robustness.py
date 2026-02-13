"""Robustness diagnostics for Logic-P&L correlation.

Produces:
- Bootstrap CI for Spearman rho
- Leave-one-agent-out influence analysis
- Permutation p-value sanity check
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr, permutation_test


EVAL_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = EVAL_DIR / "results"
CORR_PATH = RESULTS_DIR / "logic_pnl_correlation.json"
OUT_PATH = RESULTS_DIR / "logic_pnl_robustness.json"


def _load_pairs() -> list[dict]:
    if not CORR_PATH.exists():
        raise FileNotFoundError(
            f"Missing {CORR_PATH}. Run correlation.logic_pnl first."
        )
    payload = json.loads(CORR_PATH.read_text())
    return payload.get("pairs", [])


def _bootstrap_spearman(scores: np.ndarray, deltas: np.ndarray, n_boot: int = 10_000) -> dict:
    rng = np.random.default_rng(42)
    vals: list[float] = []
    n = len(scores)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        rho, _ = spearmanr(scores[idx], deltas[idx])
        if np.isfinite(rho):
            vals.append(float(rho))

    if not vals:
        return {
            "samples": 0,
            "ci95": [None, None],
            "median": None,
        }

    arr = np.array(vals)
    return {
        "samples": int(arr.size),
        "ci95": [float(np.quantile(arr, 0.025)), float(np.quantile(arr, 0.975))],
        "median": float(np.quantile(arr, 0.5)),
    }


def _leave_one_out(pairs: list[dict], scores: np.ndarray, deltas: np.ndarray) -> list[dict]:
    output: list[dict] = []
    for i, pair in enumerate(pairs):
        mask = np.ones(len(pairs), dtype=bool)
        mask[i] = False
        rho, p_value = spearmanr(scores[mask], deltas[mask])
        output.append(
            {
                "excluded_agent": pair["agent"],
                "rho": float(rho),
                "p_value": float(p_value),
            }
        )
    return output


def run_robustness() -> dict:
    pairs = _load_pairs()
    if len(pairs) < 3:
        result = {
            "n": len(pairs),
            "error": "Need at least 3 paired observations",
        }
        OUT_PATH.write_text(json.dumps(result, indent=2))
        return result

    scores = np.array([p["reasoning_score"] for p in pairs], dtype=float)
    deltas = np.array([p["delta_beneat"] for p in pairs], dtype=float)

    rho, p_value = spearmanr(scores, deltas)
    unique_scores = int(np.unique(scores).shape[0])

    bootstrap = _bootstrap_spearman(scores, deltas)
    loo = _leave_one_out(pairs, scores, deltas)

    perm = permutation_test(
        (scores, deltas),
        statistic=lambda x, y: spearmanr(x, y)[0],
        vectorized=False,
        n_resamples=100_000,
        alternative="two-sided",
        random_state=0,
    )

    result = {
        "n": len(pairs),
        "rho": float(rho),
        "p_value": float(p_value),
        "permutation_p_value": float(perm.pvalue),
        "unique_reasoning_scores": unique_scores,
        "bootstrap": bootstrap,
        "leave_one_out": loo,
        "notes": [
            "High p-values indicate no detectable monotonic relationship at current sample size.",
            "Bootstrap CI width indicates uncertainty range for true rho.",
            "Leave-one-out analysis checks single-agent influence on rho.",
        ],
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    payload = run_robustness()
    print("=" * 60)
    print("Logic-P&L Robustness Report")
    print("=" * 60)
    print(f"n={payload.get('n')}")
    print(f"rho={payload.get('rho'):.4f}, p={payload.get('p_value'):.4f}")
    print(f"perm_p={payload.get('permutation_p_value'):.4f}")
    ci = payload.get("bootstrap", {}).get("ci95", [None, None])
    print(f"bootstrap 95% CI: [{ci[0]}, {ci[1]}]")
    print(f"Saved: {OUT_PATH}")
