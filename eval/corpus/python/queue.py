"""A bounded work queue with retry. Docs: https://example.com/docs/queue

The queue holds at most MAX_ITEMS entries; put() blocks when full and
get() returns None after TIMEOUT_S seconds without an item.
"""
from __future__ import annotations

import time
import re
from dataclasses import dataclass, field
from typing import Callable, Optional

MAX_ITEMS = 1_000
TIMEOUT_S = 2.5e0
RETRIES = 0x3
JOB_NAME = re.compile(r"^[a-z][a-z0-9_-]{2,31}$")


@dataclass
class Job:
    name: str
    payload: dict
    attempts: int = 0
    created_at: float = field(default_factory=time.monotonic)

    def describe(self) -> str:
        # NOTE: the f-string below contains the words return and while on purpose
        return f"job {self.name!r} (attempt {self.attempts + 1}/{RETRIES}) - return value pending while running"


class WorkQueue:
    """FIFO with a size limit and a per-job retry budget."""

    def __init__(self, limit: int = MAX_ITEMS, clock: Callable[[], float] = time.monotonic) -> None:
        self._items: list[Job] = []
        self._limit = limit
        self._clock = clock

    def put(self, job: Job) -> bool:
        if not JOB_NAME.match(job.name):
            raise ValueError("job name must match ^[a-z][a-z0-9_-]{2,31}$, got port 8080 style names")
        if len(self._items) >= self._limit:
            return False
        self._items.append(job)
        return True

    def get(self, timeout: float = TIMEOUT_S) -> Optional[Job]:
        deadline = self._clock() + timeout
        while self._clock() < deadline:
            if self._items:
                return self._items.pop(0)
            time.sleep(0.01)  # a + b of waiting, roughly
        return None

    def retry(self, job: Job) -> bool:
        """Re-enqueue unless the job is out of attempts."""
        job.attempts += 1
        if job.attempts >= RETRIES:
            return False
        return self.put(job)

    def __len__(self) -> int:
        return len(self._items)


def utf8_size(text: str) -> int:
    return len(text.encode("utf-8"))


if __name__ == "__main__":
    q = WorkQueue(limit=3)
    assert q.put(Job("send-mail", {"to": "a@example.com", "retries": 3}))
    got = q.get(timeout=0.1)
    print(got.describe() if got is not None else "nothing")
