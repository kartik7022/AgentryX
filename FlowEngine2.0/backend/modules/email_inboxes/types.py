# backend/modules/email_inboxes/types.py

from typing import Any, Dict, List

EMAIL_INBOX_TYPES = [
    {
        "provider_type": "google",
        "label": "Google Gmail",
        "auth_family": "basic",
        "required_fields": [
            {"name": "username", "label": "Email Address", "type": "text"},
            {"name": "password", "label": "Password",      "type": "password"},
        ],
    },
    {
        "provider_type": "microsoft365",
        "label": "Microsoft 365",
        "auth_family": "basic",
        "required_fields": [
            {"name": "username", "label": "Email Address", "type": "text"},
            {"name": "password", "label": "Password",      "type": "password"},
        ],
    },
    {
        "provider_type": "imap",
        "label": "IMAP",
        "auth_family": "basic",
        "required_fields": [
            {"name": "username", "label": "Email Address", "type": "text"},
            {"name": "password", "label": "Password",      "type": "password"},
        ],
    },
    {
        "provider_type": "exchange",
        "label": "Exchange",
        "auth_family": "basic",
        "required_fields": [
            {"name": "username", "label": "Email Address", "type": "text"},
            {"name": "password", "label": "Password",      "type": "password"},
        ],
    },
]


def get_all_types() -> List[Dict[str, Any]]:
    return EMAIL_INBOX_TYPES


def get_type(provider_type: str) -> Dict[str, Any]:
    for t in EMAIL_INBOX_TYPES:
        if t["provider_type"] == provider_type:
            return t
    raise ValueError(f"Unknown email inbox provider type: '{provider_type}'")