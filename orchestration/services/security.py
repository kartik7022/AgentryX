# orchestration/services/security.py
# Auth completely removed — all APIs open, no JWT needed

from dataclasses import dataclass

@dataclass
class AuthContext:
    subject:   str = "system"
    role:      str = "orchestration_admin"
    roles:     list = None
    tenant_id: str = "global"

    def __post_init__(self):
        if self.roles is None:
            self.roles = ["orchestration_admin"]


def get_auth_context() -> AuthContext:
    return AuthContext()


def require_admin() -> AuthContext:
    return AuthContext()