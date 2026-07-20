from __future__ import annotations

import sys
from pathlib import Path
import os

import pytest


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("JWT_SECRET_KEY", "docai-test-secret")
os.environ.setdefault("AUTH_DISABLED", "true")


@pytest.fixture
def anyio_backend():
    return "asyncio"
