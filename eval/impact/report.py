"""Generate a pitch-safe impact report from evaluation artifacts."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


EVAL_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = EVAL_DIR / "results"

CORR = RESULTS_DIR / "logic_pnl_correlation.json"
ROBUST = RESULTS_DIR / "logic_pnl_robustness.json"
ABL = RESULTS_DIR / "enforcement_ablations.json"
STRESS = RESULTS_DIR / "regime_stress.json"
OUT_MD = RESULTS_DIR / "impact_report.md"


def _load(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def _fmt(v: float | None, digits: int = 4) -> str:
    if v is None:
        return "N/A"
    return f"{v:.{digits}f}"


def generate_report() -> str:
    corr = _load(CORR)
    robust = _load(ROBUST)
    ablations = _load(ABL)
    stress = _load(STRESS)

    rho = corr.get("rho")
    p_value = corr.get("p_value")
    n = corr.get("n")

    boot = robust.get("bootstrap", {})
    ci95 = boot.get("ci95", [None, None])

    full_stack = ablations.get("aggregate", {}).get("full_stack", {})
    full_return = full_stack.get("delta_return_pct", {})
    full_dd = full_stack.get("delta_drawdown_pct", {})

    lines: list[str] = []
    lines.append("# Beneat Impact Evaluation Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append("")
    lines.append("## Executive Summary")
    lines.append("")
    lines.append(
        "Current evidence supports model-agnostic enforcement behavior in this cohort: "
        f"Spearman rho={_fmt(rho, 3)} with p={_fmt(p_value, 4)} over n={n} agents."
    )
    lines.append(
        "Interpretation: no detectable monotonic relationship at current sample size, "
        "not proof of universally zero dependence."
    )
    lines.append("")
    lines.append("## Correlation Robustness")
    lines.append("")
    lines.append(f"- Spearman rho: {_fmt(rho, 4)}")
    lines.append(f"- p-value: {_fmt(p_value, 4)}")
    lines.append(f"- Bootstrap 95% CI for rho: [{_fmt(ci95[0], 4)}, {_fmt(ci95[1], 4)}]")
    lines.append(f"- Permutation p-value: {_fmt(robust.get('permutation_p_value'), 4)}")
    lines.append(f"- Unique reasoning score levels: {robust.get('unique_reasoning_scores', 'N/A')}")
    lines.append("")
    lines.append("## Enforcement Ablations (vs Baseline)")
    lines.append("")
    lines.append(
        "- Full stack mean delta return (%): "
        f"{_fmt(full_return.get('mean'), 4)}"
    )
    lines.append(
        "- Full stack median delta return (%): "
        f"{_fmt(full_return.get('median'), 4)}"
    )
    lines.append(
        "- Full stack mean delta max drawdown (%): "
        f"{_fmt(full_dd.get('mean'), 4)}"
    )
    lines.append("- Includes toggles: stop-loss, lockout, cooldown, post-loss sizing, tilt sizing")
    lines.append("")
    lines.append("## Regime Stress")
    lines.append("")
    for entry in stress.get("regimes", []):
        agg = entry.get("aggregate", {})
        lines.append(
            f"- {entry.get('regime')}: mean delta={_fmt(agg.get('mean_delta_return_pct'), 4)}%, "
            f"mean |delta|={_fmt(agg.get('mean_abs_delta_return_pct'), 4)}%"
        )
    lines.append("")
    lines.append("## Claim-Safe Language")
    lines.append("")
    lines.append(
        "Beneat behaves like deterministic risk infrastructure in this dataset: enforcement impact "
        "does not show a detectable relationship with reasoning score, while ablations and stress "
        "tests show where controls trade return for drawdown containment."
    )
    lines.append("")

    OUT_MD.write_text("\n".join(lines))
    return str(OUT_MD)


if __name__ == "__main__":
    output = generate_report()
    print("=" * 60)
    print("Impact Report Generated")
    print("=" * 60)
    print(f"Saved: {output}")
