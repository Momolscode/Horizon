#!/usr/bin/env bash
# Lance les tests e2e du mode connecté contre la pile Supabase locale.
# Prérequis : `npx supabase start` (Docker) et `npx supabase db reset` (migrations + seed).
set -euo pipefail
eval "$(npx --yes supabase@2.117.0 status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY|DB_URL)=')"
if [[ -z "${API_URL:-}" || -z "${PUBLISHABLE_KEY:-}" ]]; then
  echo "Supabase local indisponible : lancez 'npx supabase start'." >&2
  exit 1
fi
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
export DATABASE_URL="$DB_URL"
# Serveur SMTP de test de la pile locale (Mailpit, [local_smtp] dans supabase/config.toml).
export SMTP_URL="smtp://127.0.0.1:54325"
export MAIL_FROM="HORIZON (local) <no-reply@horizon.local>"
exec npx playwright test --config playwright.connected.config.ts "$@"
