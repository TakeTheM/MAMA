#!/bin/sh
set -eu

if [ "${VERCEL_ENV:-}" = production ]; then
    : "${DATABASE_URL:?Set DATABASE_URL for the Vercel Production environment}"
    exec python -m alembic upgrade head
fi
