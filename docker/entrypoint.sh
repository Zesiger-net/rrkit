#!/bin/sh
set -e

# Ensure the data directory (the only mounted volume) exists and is writable.
DB_PATH="${RRKIT_DB_PATH:-/data/rrkit.db}"
mkdir -p "$(dirname "$DB_PATH")"

exec node /app/dist/index.js
