"""DeepEval pytest plugin configuration."""
import os
import pytest

# DeepEval auto-discovers this via pytest plugin
os.environ.setdefault("DEEPEVAL_RESULTS_FOLDER", os.path.join(os.path.dirname(__file__), "results"))
