import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def log(message):
    print(f"[keycloak-google-bootstrap] {message}", flush=True)


def is_placeholder(value):
    if not value:
        return True
    normalized = value.strip().lower()
    return normalized.startswith("replace-with") or normalized in {"changeme", "todo"}


def env_int(name, default):
    value = os.getenv(name)
    if not value:
        return default
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except ValueError:
        log(f"Ignoring invalid {name}={value!r}; using {default}.")
        return default


def request_json(method, url, payload=None, headers=None, timeout=10):
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        response_body = response.read().decode("utf-8")
        if not response_body:
            return None
        return json.loads(response_body)


def request_form(url, form_data, timeout=10):
    body = urllib.parse.urlencode(form_data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_keycloak(base_url):
    attempts = env_int("KEYCLOAK_BOOTSTRAP_READY_ATTEMPTS", 420)
    delay_seconds = env_int("KEYCLOAK_BOOTSTRAP_READY_DELAY_SECONDS", 2)
    request_timeout = env_int("KEYCLOAK_BOOTSTRAP_REQUEST_TIMEOUT_SECONDS", 5)
    health_url = f"{base_url}/realms/master/.well-known/openid-configuration"
    max_wait_seconds = attempts * delay_seconds
    log(f"Waiting for Keycloak readiness at {health_url} for up to {max_wait_seconds} seconds.")
    for attempt in range(1, attempts + 1):
        try:
            request_json("GET", health_url, timeout=request_timeout)
            log("Keycloak is reachable.")
            return
        except Exception as exc:
            log(f"Waiting for Keycloak... attempt {attempt}/{attempts}: {exc}")
            if attempt == attempts:
                raise RuntimeError(f"Keycloak did not become ready: {exc}") from exc
            time.sleep(delay_seconds)


def get_admin_token(base_url, username, password):
    token_url = f"{base_url}/realms/master/protocol/openid-connect/token"
    payload = {
        "client_id": "admin-cli",
        "grant_type": "password",
        "username": username,
        "password": password,
    }
    token_response = request_form(token_url, payload)
    return token_response["access_token"]


def keycloak_admin_request(base_url, token, method, path, payload=None):
    url = f"{base_url}{path}"
    headers = {"Authorization": f"Bearer {token}"}
    return request_json(method, url, payload=payload, headers=headers)


def build_google_provider(client_id, client_secret, alias):
    return {
        "alias": alias,
        "displayName": "Google",
        "providerId": "google",
        "enabled": True,
        "updateProfileFirstLoginMode": "on",
        "trustEmail": True,
        "storeToken": False,
        "addReadTokenRoleOnCreate": False,
        "authenticateByDefault": False,
        "linkOnly": False,
        "hideOnLogin": False,
        "firstBrokerLoginFlowAlias": "first broker login",
        "config": {
            "clientId": client_id,
            "clientSecret": client_secret,
            "syncMode": "LEGACY",
            "disableUserInfo": "false",
            "filteredByClaim": "false",
            "caseSensitiveOriginalUsername": "false",
            "acceptsPromptNoneForwardFromClient": "false",
        },
    }


def build_smtp_server():
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user).strip() or smtp_user

    if is_placeholder(smtp_user) or is_placeholder(smtp_password) or is_placeholder(smtp_from_email):
        return None

    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com").strip() or "smtp.gmail.com",
        "port": str(env_int("SMTP_PORT", 587)),
        "from": smtp_from_email,
        "fromDisplayName": os.getenv("SMTP_FROM_NAME", "AgentryX").strip() or "AgentryX",
        "replyTo": os.getenv("SMTP_REPLY_TO", "").strip(),
        "replyToDisplayName": os.getenv("SMTP_REPLY_TO_DISPLAY_NAME", "").strip(),
        "envelopeFrom": os.getenv("SMTP_ENVELOPE_FROM", "").strip(),
        "auth": os.getenv("SMTP_AUTH", "true").strip().lower() or "true",
        "authType": os.getenv("SMTP_AUTH_TYPE", "basic").strip() or "basic",
        "user": smtp_user,
        "password": smtp_password,
        "starttls": os.getenv("SMTP_STARTTLS", "true").strip().lower() or "true",
        "ssl": os.getenv("SMTP_SSL", "false").strip().lower() or "false",
        "debug": os.getenv("SMTP_DEBUG", "false").strip().lower() or "false",
    }


def configure_smtp(base_url, token, realm, smtp_server):
    encoded_realm = urllib.parse.quote(realm, safe="")
    realm_path = f"/admin/realms/{encoded_realm}"
    realm_config = keycloak_admin_request(base_url, token, "GET", realm_path)
    realm_config["smtpServer"] = smtp_server
    keycloak_admin_request(base_url, token, "PUT", realm_path, realm_config)
    log(
        "SMTP server configured for realm "
        f"'{realm}' using host '{smtp_server['host']}' and sender '{smtp_server['from']}'."
    )


def configure_realm_theme(base_url, token, realm, login_theme=None, email_theme=None, clear_email_theme=False):
    encoded_realm = urllib.parse.quote(realm, safe="")
    realm_path = f"/admin/realms/{encoded_realm}"
    realm_config = keycloak_admin_request(base_url, token, "GET", realm_path)

    changed = False
    theme_updates = {
        "loginTheme": login_theme,
        "emailTheme": email_theme,
    }
    for theme_key, theme_name in theme_updates.items():
        if theme_name and realm_config.get(theme_key) != theme_name:
            realm_config[theme_key] = theme_name
            changed = True
    if clear_email_theme and realm_config.get("emailTheme"):
        realm_config["emailTheme"] = ""
        changed = True

    if not changed:
        log(f"Theme settings already configured for realm '{realm}'.")
        return

    keycloak_admin_request(base_url, token, "PUT", realm_path, realm_config)
    log(f"Theme settings configured for realm '{realm}'.")


def configure_google_provider(base_url, token, realm, client_id, client_secret, alias):
    encoded_realm = urllib.parse.quote(realm, safe="")
    encoded_alias = urllib.parse.quote(alias, safe="")
    provider_path = f"/admin/realms/{encoded_realm}/identity-provider/instances/{encoded_alias}"

    try:
        provider = keycloak_admin_request(base_url, token, "GET", provider_path)
        provider["enabled"] = True
        provider["trustEmail"] = True
        provider.setdefault("config", {})
        provider["config"]["clientId"] = client_id
        provider["config"]["clientSecret"] = client_secret
        keycloak_admin_request(base_url, token, "PUT", provider_path, provider)
        log(f"Google identity provider '{alias}' updated for realm '{realm}'.")
        return
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise

    provider = build_google_provider(client_id, client_secret, alias)
    create_path = f"/admin/realms/{encoded_realm}/identity-provider/instances"
    keycloak_admin_request(base_url, token, "POST", create_path, provider)
    log(f"Google identity provider '{alias}' created for realm '{realm}'.")


def main():
    base_url = os.getenv("KEYCLOAK_BOOTSTRAP_URL", os.getenv("KEYCLOAK_URL", "http://keycloak:8080")).rstrip("/")
    realm = os.getenv("KEYCLOAK_REALM", "flowengine")
    admin_username = os.getenv(
        "KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME",
        os.getenv("KEYCLOAK_ADMIN_USERNAME", "admin"),
    )
    admin_password = os.getenv(
        "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD",
        os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin"),
    )
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    google_alias = os.getenv("GOOGLE_IDP_ALIAS", "google").strip() or "google"
    theme_name = os.getenv("KEYCLOAK_BOOTSTRAP_THEME", "agentryx").strip() or "agentryx"
    master_login_theme = (
        os.getenv("KEYCLOAK_BOOTSTRAP_MASTER_LOGIN_THEME", "agentryx-keycloak-admin").strip()
        or "agentryx-keycloak-admin"
    )
    smtp_server = build_smtp_server()

    google_configured = not (is_placeholder(google_client_id) or is_placeholder(google_client_secret))
    smtp_configured = smtp_server is not None

    if not google_configured:
        log("Google OAuth credentials are not configured in .env. Skipping Google IdP bootstrap.")
    if not smtp_configured:
        log("SMTP credentials are not configured in .env. Skipping SMTP bootstrap.")

    wait_for_keycloak(base_url)
    token = get_admin_token(base_url, admin_username, admin_password)

    configure_realm_theme(base_url, token, "master", login_theme=master_login_theme, clear_email_theme=True)
    configure_realm_theme(base_url, token, realm, login_theme=theme_name, email_theme=theme_name)

    if smtp_configured:
        configure_smtp(base_url, token, realm, smtp_server)
    if google_configured:
        configure_google_provider(base_url, token, realm, google_client_id, google_client_secret, google_alias)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"Failed to configure Google identity provider: {exc}")
        raise
