#!/usr/bin/env bash
# Builds the app against the FAKE Supabase (tests/e2e/fake-supabase.mjs), serves it, renders every /360
# page as each persona (tests/e2e/render.mjs), then stops everything. Never touches a real Supabase.
# NOTE: overwrites .next with a test build; run `npm run build` again before deploying from this checkout.
# Usage: npm run test:render            (SHOTS=/path/to/dir to keep screenshots)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
PORT="${RENDER_PORT:-3400}"
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54399" NEXT_PUBLIC_SUPABASE_ANON_KEY="fake-anon-key" CR360_GUARDIAN_CONSENT_VERSION="consent-test"
npx next build >/dev/null
# Own process group, so the server AND its next-server worker are stopped together.
setsid npx next start -p "$PORT" >/dev/null 2>&1 &
PGID=$!
trap 'kill -- -"$PGID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
BASE_URL="http://localhost:$PORT" node tests/e2e/render.mjs
