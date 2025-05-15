import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from alembic import context

#Configuración de logging
config = context.config
fileConfig(config.config_file_name)

#Importa SETTINGS y MODELOS
from app.core.config import settings     # tu DATABASE_URL
from sqlmodel import SQLModel
# luego, cuando añadas más modelos:
# from app.models import room, task, asignacion

# Metadata para autogenerate
target_metadata = SQLModel.metadata

# -----------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Genera SQL sin conectar, útil para CI."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

# -----------------------------------------------------------------------------
def do_run_migrations(connection: Connection) -> None:
    """Ejecuta migraciones en una conexión ya abierta."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    """Crea un AsyncEngine y aplica migraciones."""
    connectable: AsyncEngine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

# -----------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
