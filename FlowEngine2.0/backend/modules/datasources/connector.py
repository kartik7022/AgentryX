"""
Connector test functions — one per datasource type.
Type names match FlowEngine's VALID_DATASOURCE_TYPES (underscore convention).
"""

from typing import Any, Dict
from backend.core.config import settings


def _require(params: Dict[str, Any], fields: list) -> None:
    missing = [f for f in fields if not str(params.get(f, "")).strip()]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")
def test_salesforce(params: Dict[str, Any]) -> None:
    _require(params, ["client_id", "client_secret", "refresh_token", "instance_url"])
    import urllib.request, urllib.parse, urllib.error, json as _json, ssl

    instance_url = params["instance_url"].rstrip("/")
    auth_url = f"{instance_url}/services/oauth2/token"

    body = urllib.parse.urlencode({
        "grant_type":    "refresh_token",
        "client_id":     params["client_id"],
        "client_secret": params["client_secret"],
        "refresh_token": params["refresh_token"],
    }).encode()

    req = urllib.request.Request(auth_url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = _json.loads(resp.read())
            if "access_token" not in data:
                raise RuntimeError(f"Salesforce auth failed: {data.get('error_description', data)}")
            access_token = data["access_token"]
            api_instance_url = data.get("instance_url", instance_url)
    except urllib.error.HTTPError as exc:
        err = exc.read().decode(errors="replace")
        raise RuntimeError(f"Salesforce connection failed ({exc.code}): {err}")
    except Exception as exc:
        raise RuntimeError(f"Salesforce connection failed: {exc}")

    # Verify by running a simple SOQL query
    query_url = f"{api_instance_url}/services/data/v59.0/query?q=SELECT+Id+FROM+Organization+LIMIT+1"
    query_req = urllib.request.Request(query_url, method="GET")
    query_req.add_header("Authorization", f"Bearer {access_token}")
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(query_req, timeout=10, context=ctx) as resp:
            result = _json.loads(resp.read())
            if "records" not in result:
                raise RuntimeError(f"Salesforce query verification failed: {result}")
    except urllib.error.HTTPError as exc:
        err = exc.read().decode(errors="replace")
        raise RuntimeError(f"Salesforce query verification failed ({exc.code}): {err}")
    except Exception as exc:
        raise RuntimeError(f"Salesforce query verification failed: {exc}")

def test_snowflake(params: Dict[str, Any]) -> None:
    _require(params, ["account", "warehouse", "database", "schema", "user", "password"])
    try:
        import snowflake.connector
    except ImportError:
        raise RuntimeError("snowflake-connector-python is not installed.")
    try:
        conn = snowflake.connector.connect(
            user=params["user"],
            password=params["password"],
            account=params["account"],
            login_timeout=10,
            network_timeout=10,
        )
        try:
            cur = conn.cursor()
            cur.execute(f'USE WAREHOUSE "{params["warehouse"].replace(chr(34), "")}"')
            cur.execute(f'USE DATABASE "{params["database"].replace(chr(34), "")}"')
            cur.execute(f'USE SCHEMA "{params["schema"].replace(chr(34), "")}"')
            cur.execute("SELECT CURRENT_VERSION()")
        finally:
            conn.close()
    except Exception as exc:
        raise RuntimeError(f"Snowflake connection failed: {exc}")


def test_postgres(params: Dict[str, Any]) -> None:
    _require(params, ["host", "port", "database", "username", "password"])
    try:
        import psycopg2
    except ImportError:
        raise RuntimeError("psycopg2 is not installed.")
    try:
        conn = psycopg2.connect(
            host=params["host"],
            port=int(params["port"]),
            dbname=params["database"],
            user=params["username"],
            password=params["password"],
            connect_timeout=5,
        )
        try:
            conn.cursor().execute("SELECT 1")
        finally:
            conn.close()
    except psycopg2.OperationalError as exc:
        raise RuntimeError(f"PostgreSQL connection failed: {exc}")


AVAILABLE_TEST_FUNCTIONS = {
    "test_salesforce": lambda p: test_salesforce(p),
    "test_postgres":   lambda p: test_postgres(p),
    "test_snowflake":  lambda p: test_snowflake(p),
}


def run_test(datasource_type: str, params: Dict[str, Any]) -> None:
    from backend.modules.datasource_types import repository as dst_repo

    # Resolve driver via alias
    driver = dst_repo.resolve_driver_by_alias(datasource_type)
    if not driver:
        # Try canonical name directly
        driver = dst_repo.get_driver_by_canonical_name(datasource_type)
    if not driver:
        raise ValueError(f"Unknown datasource type: '{datasource_type}'")

    canonical_name = driver["canonical_name"]

    # Map canonical_name to test function
    fn_map = {
        "salesforce_tooling": lambda p: test_salesforce(p),
        "postgres":           lambda p: test_postgres(p),
        "snowflake":          lambda p: test_snowflake(p),
        "salesforcetest": lambda p: test_salesforce(p),
    }

    fn = fn_map.get(canonical_name)
    if fn is None:
        raise ValueError(f"No test function available for driver '{canonical_name}'.")

    fn(params)




# ── Email inbox test functions ────────────────────────────────────────────────

def test_imap(params: Dict[str, Any], host: str, port: int, use_ssl: bool) -> None:
    _require(params, ["username", "password"])
    import imaplib
    try:
        if use_ssl:
            conn = imaplib.IMAP4_SSL(host, port, timeout=10)
        else:
            conn = imaplib.IMAP4(host, port)
        try:
            conn.login(params["username"], params["password"])
            conn.logout()
        except imaplib.IMAP4.error as exc:
            raise RuntimeError(f"IMAP login failed: {exc}")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"IMAP connection failed: {exc}")


def test_pop3(params: Dict[str, Any], host: str, port: int, use_ssl: bool) -> None:
    _require(params, ["username", "password"])
    import poplib
    try:
        if use_ssl:
            conn = poplib.POP3_SSL(host, port)
        else:
            conn = poplib.POP3(host, port)
        try:
            conn.user(params["username"])
            conn.pass_(params["password"])
            conn.quit()
        except poplib.error_proto as exc:
            raise RuntimeError(f"POP3 login failed: {exc}")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"POP3 connection failed: {exc}")


def test_smtp(params: Dict[str, Any], host: str, port: int, use_ssl: bool) -> None:
    _require(params, ["username", "password"])
    import smtplib
    try:
        if use_ssl:
            conn = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            conn = smtplib.SMTP(host, port, timeout=10)
            conn.starttls()
        try:
            conn.login(params["username"], params["password"])
            conn.quit()
        except smtplib.SMTPAuthenticationError as exc:
            raise RuntimeError(f"SMTP login failed: {exc}")
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"SMTP connection failed: {exc}")


EMAIL_CONNECTOR_MAP = {
    "imap":     lambda p, h, port, ssl: test_imap(p, h, port, ssl),
    "pop3":     lambda p, h, port, ssl: test_pop3(p, h, port, ssl),
    "smtp":     lambda p, h, port, ssl: test_smtp(p, h, port, ssl),
    "google":   lambda p, h, port, ssl: test_imap(p, h, port, ssl),
    "microsoft365": lambda p, h, port, ssl: test_imap(p, h, port, ssl),
    "exchange": lambda p, h, port, ssl: test_imap(p, h, port, ssl),
}


def run_email_test(
    provider_type: str,
    params: Dict[str, Any],
    host: str = "",
    port: int = 993,
    use_ssl: bool = True,
) -> None:
    fn = EMAIL_CONNECTOR_MAP.get(provider_type)
    if fn is None:
        raise ValueError(f"Unknown email provider type: '{provider_type}'")
    fn(params, host, port, use_ssl)