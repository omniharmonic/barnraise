#!/usr/bin/env bash
# Idempotent local/CI-web dev setup: ensure Postgres is running, the dev and
# test databases exist, the schema is pushed, and .env.local is present.
set -euo pipefail

DB_USER="${DB_USER:-barnraise}"
DB_PASS="${DB_PASS:-barnraise}"
DB_HOST="${DB_HOST:-localhost}"

# Start Postgres if the server is installed and not running.
if command -v pg_ctlcluster >/dev/null 2>&1; then
  service postgresql start >/dev/null 2>&1 || true
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}' SUPERUSER;" >/dev/null 2>&1 || true

for dbname in barnraise barnraise_test; do
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${dbname}'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${dbname} OWNER ${DB_USER};" >/dev/null 2>&1 || true
done

if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/barnraise
AUTH_SECRET=dev-secret-change-me-0123456789abcdef
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
ENV
fi

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/barnraise"
pnpm exec drizzle-kit push --force >/dev/null 2>&1 || true
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/barnraise_test" pnpm exec drizzle-kit push --force >/dev/null 2>&1 || true

echo "dev setup complete"
