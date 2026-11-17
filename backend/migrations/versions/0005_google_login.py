"""Google login accounts and cookie sessions (expand).

예전(0004) 백엔드가 아직 트래픽을 받는 동안 적용해도 되는 변경만 담는다.
캠페인 소유자 채우기와 NOT NULL 제약은 0006에서 새 백엔드·로그인 화면으로 전환한 뒤 적용한다.

Revision ID: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)
    op.add_column("users", sa.Column("google_sub", sa.String(255)))
    op.add_column("users", sa.Column("name", sa.String(200)))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])
    # 예전 Refresh Token 세션은 새 쿠키 세션으로 쓸 수 없으므로 비운다. 0004 백엔드는 이 표를 읽지 않는다.
    op.execute(sa.text("DELETE FROM auth_sessions"))
    op.alter_column(
        "auth_sessions", "refresh_token_hash", new_column_name="token_hash",
        existing_type=sa.String(64), existing_nullable=False,
    )
    op.create_unique_constraint("uq_auth_sessions_token_hash", "auth_sessions", ["token_hash"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT 1 FROM users WHERE password_hash IS NULL LIMIT 1")).first():
        raise RuntimeError("Google-only accounts have no password and cannot be downgraded")
    op.drop_constraint("uq_auth_sessions_token_hash", "auth_sessions", type_="unique")
    op.execute(sa.text("DELETE FROM auth_sessions"))
    op.alter_column(
        "auth_sessions", "token_hash", new_column_name="refresh_token_hash",
        existing_type=sa.String(64), existing_nullable=False,
    )
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "name")
    op.drop_column("users", "google_sub")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
