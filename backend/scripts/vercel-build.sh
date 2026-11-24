#!/bin/sh
set -eu

# 운영 빌드는 예전 백엔드와 함께 써도 되는 리비전까지만 자동 적용한다.
# 이 백엔드는 0007(users.supabase_user_id)이 있어야 동작한다. 0006이 아직이면 함께 적용되며,
# 소유자 없는 캠페인이 남아 있으면 DDL 전에 멈추므로 LEGACY_OWNER_EMAIL을 설정하고 다시 배포한다 (README "배포 순서").
# 새 확장(expand) 마이그레이션을 추가하면 이 기본값도 함께 올린다.
if [ "${VERCEL_ENV:-}" = production ]; then
    : "${DATABASE_URL:?Set DATABASE_URL for the Vercel Production environment}"
    exec python -m alembic upgrade "${MIGRATION_TARGET:-0007}"
fi
