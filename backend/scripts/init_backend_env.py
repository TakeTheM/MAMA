"""로컬 MySQL 개발용 설정 생성. 기존 .env는 덮어쓰지 않습니다."""
import os
from pathlib import Path
from secrets import token_hex

root = Path(__file__).resolve().parents[1]
target = root / ".env"
password = token_hex(24)
values = {
    "DATABASE_URL": f"mysql+pymysql://mama:{password}@127.0.0.1:3307/mama",
    "JWT_SECRET": token_hex(48),
    "MYSQL_ROOT_PASSWORD": token_hex(24),
    "MYSQL_PASSWORD": password,
    "TEST_DATABASE_URL": "mysql+pymysql://mama_test:local-test-only@127.0.0.1:3308/mama_test",
}
lines = []
for line in (root / ".env.example").read_text().splitlines():
    name = line.split("=", 1)[0]
    lines.append(f"{name}={values[name]}" if name in values else line)
try:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print(".env가 이미 있어 유지했습니다. 필요한 값은 직접 확인해 주세요.")
else:
    with os.fdopen(descriptor, "w") as file:
        file.write("\n".join(lines) + "\n")
    print(".env에 로컬 개발 설정을 생성했습니다. 비밀값은 커밋하지 마세요.")
