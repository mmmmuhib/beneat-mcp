#!/usr/bin/env python3
"""CI-optimized subset: runs only deterministic tests + benchmarks (no LLM judge)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import os

EVAL_DIR = Path(__file__).parent
PROJECT_ROOT = EVAL_DIR.parent


def ensure_venv_python() -> None:
    """Re-exec into workspace .venv Python when available."""
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


def main():
    ensure_venv_python()
    print("Beneat CI Evaluation (deterministic subset)")

    # Run only the red-team and benchmark tests (no LLM-as-judge)
    results = []

    for module in [
        "benchmarks.msb_adapter",
        "benchmarks.mcpsecbench_adapter",
        "benchmarks.mcpmark_adapter",
    ]:
        script_name = module.split(".")[-1] + ".py"
        path = EVAL_DIR / "benchmarks" / script_name
        if path.exists():
            r = subprocess.run([sys.executable, "-m", module], cwd=str(EVAL_DIR))
            results.append(r.returncode)

    # Run pytest but only the deterministic tests (skip LLM-judge tests)
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "test_cases/test_lockout_redteam.py", "-v", "--tb=short", "-x",
         "-k", "not deepteam"],
        cwd=str(EVAL_DIR),
    )
    results.append(r.returncode)

    worst = max(results) if results else 0
    sys.exit(worst)


if __name__ == "__main__":
    main()
