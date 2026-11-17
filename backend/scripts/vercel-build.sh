#!/bin/sh
set -eu

# 운영 빌드는 예전 백엔드와 함께 써도 되는 리비전까지만 자동 적용한다.
# 0006(캠페인 소유자 NOT NULL)은 새 백엔드·로그인 화면으로 전환한 뒤 직접 적용한다 (README "배포 순서").
# 새 확장(expand) 마이그레이션을 추가하면 이 기본값도 함께 올린다.
if [ "${VERCEL_ENV:-}" = production ]; then
    : "${DATABASE_URL:?Set DATABASE_URL for the Vercel Production environment}"
    exec python -m alembic upgrade "${MIGRATION_TARGET:-0005}"
fi
