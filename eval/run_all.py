#!/usr/bin/env python3
"""Run the full Beneat evaluation suite.

Starts MCP server, runs all tests, benchmarks, and correlation analysis.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

EVAL_DIR = Path(__file__).parent
PROJECT_ROOT = EVAL_DIR.parent
MCP_DIR = PROJECT_ROOT / "mcp-server"
RESULTS_DIR = EVAL_DIR / "results"


def ensure_venv_python() -> None:
    """Re-exec into workspace .venv Python when available.

    This allows `python3 run_all.py` to work even when system Python doesn't
    have eval dependencies installed.
    """
    if os.environ.get("BENEAT_EVAL_BOOTSTRAPPED") == "1":
        return

    venv_python = PROJECT_ROOT / ".venv" / "bin" / "python"
    if not venv_python.exists():
        return

    # Reliable venv detection even when .venv/bin/python resolves to /usr/bin/pythonX.Y.
    if sys.prefix != sys.base_prefix:
        return

    print(f"Re-launching with virtualenv interpreter: {venv_python}")
    env = os.environ.copy()
    env["BENEAT_EVAL_BOOTSTRAPPED"] = "1"
    os.execvpe(str(venv_python), [str(venv_python), str(Path(__file__).resolve())], env)


def start_mcp_server() -> subprocess.Popen | None:
    """Start the MCP server in HTTP mode and wait for it to be ready."""
    print("\n[1/8] Starting MCP server...")

    # Check if already running
    from adapters.mcp_client import MCPClient
    client = MCPClient()
    if client.health_check():
        print("  MCP server already running.")
        return None

    proc = subprocess.Popen(
        ["npm", "run", "start:http"],
        cwd=str(MCP_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Health-check loop
    if client.wait_for_server(timeout=15, poll_interval=0.5):
        print("  MCP server ready.")
        return proc
    else:
        proc.terminate()
        print("  ERROR: MCP server failed to start within 15s.")
        sys.exit(1)


def run_deepeval_tests() -> int:
    """Run DeepEval pytest test suite."""
    print("\n[2/8] Running DeepEval test suite...")
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "test_cases/", "-v", "--tb=short", "-x"],
        cwd=str(EVAL_DIR),
    )
    return result.returncode


def run_benchmarks() -> int:
    """Run MSB, MCPSecBench, and MCPMark benchmarks."""
    print("\n[3/8] Running security benchmarks...")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    worst = 0
    for module in [
        "benchmarks.msb_adapter",
        "benchmarks.mcpsecbench_adapter",
        "benchmarks.mcpmark_adapter",
    ]:
        script_name = module.split(".")[-1] + ".py"
        script_path = EVAL_DIR / "benchmarks" / script_name
        if script_path.exists():
            print(f"\n  Running {script_name}...")
            result = subprocess.run(
                [sys.executable, "-m", module],
                cwd=str(EVAL_DIR),
            )
            worst = max(worst, result.returncode)
    return worst


def run_correlation() -> int:
    """Run Logic-P&L correlation analysis."""
    print("\n[4/8] Running Logic-P&L correlation...")
    result = subprocess.run(
        [sys.executable, "-m", "correlation.logic_pnl"],
        cwd=str(EVAL_DIR),
    )
    return result.returncode


def run_impact_robustness() -> int:
    """Run robustness diagnostics for the correlation layer."""
    print("\n[5/8] Running impact robustness diagnostics...")
    result = subprocess.run(
        [sys.executable, "-m", "impact.robustness"],
        cwd=str(EVAL_DIR),
    )
    return result.returncode


def run_impact_ablations() -> int:
    """Run deterministic ablation analysis for control attribution."""
    print("\n[6/8] Running enforcement ablations...")
    result = subprocess.run(
        [sys.executable, "-m", "impact.ablations"],
        cwd=str(EVAL_DIR),
    )
    return result.returncode


def run_regime_stress() -> int:
    """Run market-regime stress tests."""
    print("\n[7/8] Running regime stress tests...")
    result = subprocess.run(
        [sys.executable, "-m", "impact.regime_stress"],
        cwd=str(EVAL_DIR),
    )
    return result.returncode


def generate_summary() -> None:
    """Generate a summary report from all results."""
    print("\n[8/8] Generating summary report...")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    summary = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "layers": {
            "integrity": "DeepEval ToolCorrectness + TaskCompletion",
            "safety": "MSB (12 attacks) + MCPSecBench (4 surfaces) + MCPMark (5 stress tests)",
            "impact": "DR-CAM Spearman correlation + robustness + ablations + regime stress",
        },
    }

    # Load correlation results if available
    corr_path = RESULTS_DIR / "logic_pnl_correlation.json"
    if corr_path.exists():
        with open(corr_path) as f:
            summary["correlation"] = json.load(f)

    robust_path = RESULTS_DIR / "logic_pnl_robustness.json"
    if robust_path.exists():
        with open(robust_path) as f:
            summary["impact_robustness"] = json.load(f)

    ablations_path = RESULTS_DIR / "enforcement_ablations.json"
    if ablations_path.exists():
        with open(ablations_path) as f:
            summary["impact_ablations"] = json.load(f)

    stress_path = RESULTS_DIR / "regime_stress.json"
    if stress_path.exists():
        with open(stress_path) as f:
            summary["impact_regime_stress"] = json.load(f)

    report_path = RESULTS_DIR / "impact_report.md"
    if report_path.exists():
        summary["impact_report"] = str(report_path)

    with open(RESULTS_DIR / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"  Summary saved to {RESULTS_DIR / 'summary.json'}")


def main():
    print("=" * 60)
    print("Beneat Evaluation Suite")
    print("=" * 60)

    mcp_proc = start_mcp_server()

    try:
        rc_tests = run_deepeval_tests()
        rc_bench = run_benchmarks()
        rc_corr = run_correlation()
        rc_robust = run_impact_robustness()
        rc_abl = run_impact_ablations()
        rc_stress = run_regime_stress()

        subprocess.run(
            [sys.executable, "-m", "impact.report"],
            cwd=str(EVAL_DIR),
            check=False,
        )

        generate_summary()

        worst = max(rc_tests, rc_bench, rc_corr, rc_robust, rc_abl, rc_stress)

        print(f"\n{'='*60}")
        print(f"Results:")
        print(f"  DeepEval tests:   {'PASS' if rc_tests == 0 else 'FAIL'}")
        print(f"  Security benches: {'PASS' if rc_bench == 0 else 'FAIL'}")
        print(f"  Correlation:      {'PASS' if rc_corr == 0 else 'FAIL'}")
        print(f"  Robustness:       {'PASS' if rc_robust == 0 else 'FAIL'}")
        print(f"  Ablations:        {'PASS' if rc_abl == 0 else 'FAIL'}")
        print(f"  Regime stress:    {'PASS' if rc_stress == 0 else 'FAIL'}")
        print(f"{'='*60}")

        sys.exit(worst)

    finally:
        if mcp_proc:
            mcp_proc.terminate()
            print("\n  MCP server stopped.")


if __name__ == "__main__":
    ensure_venv_python()
    main()
