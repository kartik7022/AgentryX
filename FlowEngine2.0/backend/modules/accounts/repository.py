# backend/modules/accounts/repository.py

import secrets
import string


# ── Utilities ─────────────────────────────────────────────────────────────────

def random_slug(length=8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_tenant_id() -> str:
    return f"T-{random_slug(8).upper()}"