"""선택적인 로컬 설정 파일 생성. DB URL은 직접 지정하며 기존 파일은 유지합니다."""
import os
from pathlib import Path
from secrets import token_hex

root = Path(__file__).resolve().parents[1]
target = root / ".env"
values = {
    "JWT_SECRET": token_hex(48),
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
    print(".env를 생성했습니다. DATABASE_URL을 지정해 주세요. 비밀값은 커밋하지 마세요.")
