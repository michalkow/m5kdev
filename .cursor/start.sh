#!/usr/bin/env bash
# Per-boot runtime initialization for Cursor Cloud Agents.
# Starts Redis, which the BullMQ workflow workers require. Idempotent.
set -euo pipefail

if redis-cli ping >/dev/null 2>&1; then
  echo "start.sh: Redis already running."
  exit 0
fi

# Daemonize without persistence (ephemeral dev queue state).
redis-server --daemonize yes --save "" --appendonly no

for _ in $(seq 1 20); do
  if redis-cli ping >/dev/null 2>&1; then
    echo "start.sh: Redis is ready."
    exit 0
  fi
  sleep 0.5
done

echo "start.sh: Redis failed to become ready." >&2
exit 1
