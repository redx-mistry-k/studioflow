#!/bin/sh
set -e
echo "==> Running database migrations..."
node dist/db/migrate.js
if [ "$SEED_DEMO" = "true" ]; then
  echo "==> Seeding demo data (skips if already seeded)..."
  node dist/seed.js || echo "seed skipped"
fi
echo "==> Starting StudioFlow backend..."
exec node dist/index.js
