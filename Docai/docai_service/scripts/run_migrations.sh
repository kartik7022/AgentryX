#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_USER="${POSTGRES_USER:-docai_user}"
DB_PASSWORD="${POSTGRES_PASSWORD:-docai_pass}"
DB_NAME="${POSTGRES_DB:-docai_db}"
DB_PORT="${POSTGRES_PORT:-5432}"

export PGPASSWORD="${DB_PASSWORD}"

psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${ROOT_DIR}/scripts/migrations/001_initial_schema.sql"

psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${ROOT_DIR}/scripts/migrations/002_seed_doc_types.sql"

psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${ROOT_DIR}/scripts/migrations/003_document_types_is_active.sql"

psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${ROOT_DIR}/scripts/migrations/004_field_mappings.sql"

psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${ROOT_DIR}/scripts/migrations/005_parse_corrections.sql"
