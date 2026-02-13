"""GLM-5 (z.ai) custom model wrapper for DeepEval judge."""
from __future__ import annotations

import json
import os
import random
import threading
import time
from typing import Any

import httpx
from deepeval.models import DeepEvalBaseLLM
from pydantic import BaseModel


class GLM5Judge(DeepEvalBaseLLM):
    """Wraps GLM-5 via z.ai's OpenAI-compatible API for use as DeepEval judge."""

    # Provider-level constraint: allow only one in-flight request at a time.
    _request_lock = threading.Lock()
    _next_request_at: float = 0.0

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model_name: str = "glm-5",
        timeout: float = 60.0,
        max_retries: int = 8,
        retry_backoff_seconds: float = 3.0,
        min_interval_seconds: float = 1.25,
    ):
        self.api_key = api_key or os.environ.get("GLM5_API_KEY", "")
        self.base_url = base_url or os.environ.get(
            "GLM5_BASE_URL", "https://api.z.ai/api/coding/paas/v4"
        )
        self.model_name = model_name
        self._client = httpx.Client(timeout=timeout)
        self.max_retries = max_retries
        self.retry_backoff_seconds = retry_backoff_seconds
        self.max_backoff_seconds = 120.0
        self.min_interval_seconds = min_interval_seconds

    def load_model(self) -> Any:
        return self

    def generate(self, prompt: str, schema: type[BaseModel] | None = None) -> str | BaseModel:
        body: dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
        }
        if schema is not None:
            body["response_format"] = {"type": "json_object"}

        content: str | None = None
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                with self._request_lock:
                    now = time.monotonic()
                    wait_for_slot = self.__class__._next_request_at - now
                    if wait_for_slot > 0:
                        time.sleep(wait_for_slot)

                    resp = self._client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=body,
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"]
                    self.__class__._next_request_at = time.monotonic() + self.min_interval_seconds
                    break
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status = exc.response.status_code
                retryable = status == 429 or 500 <= status < 600
                if not retryable or attempt >= self.max_retries:
                    raise

                retry_after = exc.response.headers.get("Retry-After")
                if retry_after:
                    try:
                        delay = float(retry_after)
                    except ValueError:
                        delay = self.retry_backoff_seconds * (2 ** attempt)
                else:
                    delay = self.retry_backoff_seconds * (2 ** attempt)
                delay = min(delay, self.max_backoff_seconds)
                jitter = random.uniform(0, delay * 0.25)
                with self._request_lock:
                    self.__class__._next_request_at = max(
                        self.__class__._next_request_at,
                        time.monotonic() + delay + jitter,
                    )
                print(f"  [GLM-5] 429 rate-limited, retry {attempt + 1}/{self.max_retries} in {delay + jitter:.1f}s")
                time.sleep(delay + jitter)

        if content is None:
            if last_error:
                raise last_error
            raise RuntimeError("GLM-5 request failed without response content")

        if schema is not None:
            return schema(**json.loads(content))
        return content

    async def a_generate(
        self, prompt: str, schema: type[BaseModel] | None = None
    ) -> str | BaseModel:
        # Sync fallback — GLM-5 doesn't require async for our evaluation volumes
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return self.model_name


def get_judge() -> GLM5Judge:
    """Factory that reads config from environment."""
    return GLM5Judge(
        api_key=os.environ.get("GLM5_API_KEY"),
        base_url=os.environ.get("GLM5_BASE_URL", "https://api.z.ai/api/coding/paas/v4"),
        max_retries=int(os.environ.get("GLM5_MAX_RETRIES", "8")),
        retry_backoff_seconds=float(os.environ.get("GLM5_RETRY_BACKOFF_SECONDS", "3.0")),
        min_interval_seconds=float(os.environ.get("GLM5_MIN_INTERVAL_SECONDS", "1.25")),
    )
