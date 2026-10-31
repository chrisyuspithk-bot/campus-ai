#!/usr/bin/env bash
# Builds and deploys to Cloudflare from a clean copy, so .env.local and data/ cannot reach the bundle
# and the VPS's .next stays untouched. Needs CLOUDFLARE_API_TOKEN in the environment.
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?export CLOUDFLARE_API_TOKEN first}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${CF_BUILD_DIR:-$HOME/campus-ai-cf-build}"
SEED_DB="$(mktemp -d)/seed.db"

mkdir -p "$BUILD"
rsync -a --delete --exclude node_modules --exclude .next --exclude .open-next --exclude .wrangler \
  --exclude data --exclude '.env*' --exclude .git --exclude pw_bing.js --exclude '*.bak*' \
  --exclude tsconfig.tsbuildinfo "$APP"/ "$BUILD"/
cd "$BUILD"
[ -d node_modules/@opennextjs/cloudflare ] || npm ci --no-audit --no-fund

DATABASE_PATH="$SEED_DB" npx tsx scripts/seed.ts
node scripts/cf-gen-seed.mjs "$SEED_DB"
CAMPUS_TARGET=cloudflare npx opennextjs-cloudflare build
[ -n "${CF_BUILD_ONLY:-}" ] || npx wrangler deploy
