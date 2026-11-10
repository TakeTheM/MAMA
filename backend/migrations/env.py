from alembic import context
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, make_engine, normalize_database_url
from app import models  # noqa: F401 — register model metadata

target_metadata = Base.metadata
database_url = context.config.attributes.get("database_url") or get_settings().database_url
if not database_url:
    raise RuntimeError("DATABASE_URL을 설정한 뒤 마이그레이션을 실행하세요")

if context.is_offline_mode():
    context.configure(url=normalize_database_url(database_url), target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(database_url)
    try:
        with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                # Serialize concurrent releases, including on transaction poolers.
                connection.execute(text("SELECT pg_advisory_xact_lock(1296125249, 1)"))
            context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
