#!/usr/bin/env bash
# 백엔드(8000)와 프론트(3000)를 함께 실행한다. Ctrl+C로 둘 다 종료.
# 포트가 이미 쓰이면 바꿔서 실행: BACKEND_PORT=8001 ./scripts/dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "포트 $port 를 이미 다른 프로그램이 쓰고 있습니다. 확인: lsof -nP -iTCP:$port -sTCP:LISTEN" >&2
    exit 1
  fi
done

(cd "$ROOT/backend" && uv run fastapi dev main.py --port "$BACKEND_PORT") &
BACKEND_PID=$!

trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

cd "$ROOT/frontend" && BACKEND_URL="http://localhost:$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT"
