#!/bin/sh
# Keep this file LF-only; it is mounted into Linux containers from Windows clones.
set -eu

KB_URL="${KB_URL:-http://killbill:8080}"
KB_ADMIN_USER="${KB_ADMIN_USER:-admin}"
KB_ADMIN_PASSWORD="${KB_ADMIN_PASSWORD:-password}"
KB_API_KEY="${KB_API_KEY:-company_a}"
KB_API_SECRET="${KB_API_SECRET:-company_a_secret}"
KB_CREATED_BY="${KB_CREATED_BY:-agentryx-bootstrap}"
KB_CATALOG_FILE="${KB_CATALOG_FILE:-/catalog.xml}"
KB_WAIT_ATTEMPTS="${KB_WAIT_ATTEMPTS:-120}"
KB_WAIT_SLEEP_SECONDS="${KB_WAIT_SLEEP_SECONDS:-5}"
REQUIRED_PLANS="${REQUIRED_PLANS:-data-basic data-standard data-pro email-validate-basic email-validate-standard email-validate-pro sql-query-basic sql-query-standard sql-query-pro}"

if [ ! -f "$KB_CATALOG_FILE" ]; then
  echo "[bootstrap] Catalog file not found: $KB_CATALOG_FILE" >&2
  exit 1
fi

echo "[bootstrap] Waiting for Kill Bill at $KB_URL..."
attempt=1
ready=0
while [ "$attempt" -le "$KB_WAIT_ATTEMPTS" ]; do
  if curl -fsS -u "$KB_ADMIN_USER:$KB_ADMIN_PASSWORD" "$KB_URL/1.0/healthcheck" >/dev/null; then
    ready=1
    break
  fi

  echo "[bootstrap] Kill Bill is not ready yet ($attempt/$KB_WAIT_ATTEMPTS)."
  sleep "$KB_WAIT_SLEEP_SECONDS"
  attempt=$((attempt + 1))
done

if [ "$ready" -ne 1 ]; then
  echo "[bootstrap] Kill Bill did not become ready in time." >&2
  exit 1
fi

echo "[bootstrap] Ensuring Kill Bill tenant exists..."
tenant_body="$(printf '{"apiKey":"%s","apiSecret":"%s"}' "$KB_API_KEY" "$KB_API_SECRET")"
tenant_status="$(
  curl -sS -o /tmp/kb-tenant-response.txt -w "%{http_code}" \
    -u "$KB_ADMIN_USER:$KB_ADMIN_PASSWORD" \
    -X POST "$KB_URL/1.0/kb/tenants?useGlobalDefault=false" \
    -H "Content-Type: application/json" \
    -H "X-Killbill-CreatedBy: $KB_CREATED_BY" \
    --data "$tenant_body" || true
)"

case "$tenant_status" in
  200|201|204)
    echo "[bootstrap] Tenant is ready."
    ;;
  400|409)
    echo "[bootstrap] Tenant already appears to exist; continuing."
    ;;
  *)
    echo "[bootstrap] Tenant setup failed with HTTP $tenant_status." >&2
    cat /tmp/kb-tenant-response.txt >&2 || true
    exit 1
    ;;
esac

echo "[bootstrap] Checking whether catalog is already loaded..."
plans_status="$(
  curl -sS -o /tmp/kb-plans.json -w "%{http_code}" \
    -u "$KB_ADMIN_USER:$KB_ADMIN_PASSWORD" \
    -H "X-Killbill-ApiKey: $KB_API_KEY" \
    -H "X-Killbill-ApiSecret: $KB_API_SECRET" \
    -H "Accept: application/json" \
    "$KB_URL/1.0/kb/catalog/availableBasePlans" || true
)"

if [ "$plans_status" = "200" ] && grep -q "data-basic" /tmp/kb-plans.json; then
  echo "[bootstrap] Catalog already contains AgentryX plans; skipping upload."
else
  echo "[bootstrap] Uploading catalog..."
  upload_status="$(
    curl -sS -o /tmp/kb-catalog-response.txt -w "%{http_code}" \
      -u "$KB_ADMIN_USER:$KB_ADMIN_PASSWORD" \
      -X POST "$KB_URL/1.0/kb/catalog/xml" \
      -H "X-Killbill-ApiKey: $KB_API_KEY" \
      -H "X-Killbill-ApiSecret: $KB_API_SECRET" \
      -H "X-Killbill-CreatedBy: $KB_CREATED_BY" \
      -H "Accept: application/json" \
      -H "Content-Type: text/xml; charset=utf-8" \
      --data-binary "@$KB_CATALOG_FILE" || true
  )"

  case "$upload_status" in
    200|201|204)
      echo "[bootstrap] Catalog uploaded."
      ;;
    *)
      echo "[bootstrap] Catalog upload failed with HTTP $upload_status." >&2
      cat /tmp/kb-catalog-response.txt >&2 || true
      exit 1
      ;;
  esac
fi

echo "[bootstrap] Verifying catalog plans..."
curl -fsS \
  -u "$KB_ADMIN_USER:$KB_ADMIN_PASSWORD" \
  -H "X-Killbill-ApiKey: $KB_API_KEY" \
  -H "X-Killbill-ApiSecret: $KB_API_SECRET" \
  -H "Accept: application/json" \
  "$KB_URL/1.0/kb/catalog/availableBasePlans" > /tmp/kb-plans.json

for plan in $REQUIRED_PLANS; do
  if ! grep -q "$plan" /tmp/kb-plans.json; then
    echo "[bootstrap] Missing required plan after catalog setup: $plan" >&2
    cat /tmp/kb-plans.json >&2
    exit 1
  fi
done

echo "[bootstrap] Kill Bill tenant and catalog are ready."
