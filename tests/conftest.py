import os
import asyncio
import sys
from types import ModuleType
import pytest_asyncio
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from httpx import AsyncClient, ASGITransport

# ---------------------------------------------------------------------------
# Mock heavy AI modules so tests do not require network access or large models
# ---------------------------------------------------------------------------

priority_mock = ModuleType("app.services.AI.priority_classifier")

def _fake_priority(title: str) -> str:
    return "alta" if "urgente" in title.lower() else "media"

priority_mock.clasificar_prioridad = _fake_priority
sys.modules.setdefault("app.services.AI.priority_classifier", priority_mock)

reform_mock = ModuleType("app.services.AI.reformulator")

def _fake_reform(title: str) -> dict:
    return {"reformulada": f"{title} (mock)", "cambio": True, "motivo": "mock"}

reform_mock.reformular_titulo_con_traduccion = _fake_reform
sys.modules.setdefault("app.services.AI.reformulator", reform_mock)

organizer_mock = ModuleType("app.services.AI.task_organizer")

def _fake_group(tasks, umbral: float = 0.4):
    grupos = {}
    for task in tasks:
        grupo = getattr(task, "categoria", "General")
        grupos.setdefault(grupo, []).append(task)
    return grupos

organizer_mock.agrupar_tareas_por_similitud = _fake_group
organizer_mock.agrupar_por_categoria = _fake_group
sys.modules.setdefault("app.services.AI.task_organizer", organizer_mock)

from app.main import app
from app.services.auth import create_access_token, hash_password
from app.models.user import Usuario
from app.core.config import settings
from uuid import uuid4

TEST_DB = "sqlite+aiosqlite:///./prioritask.db"
test_engine = create_async_engine(TEST_DB, echo=False)
async_session = async_sessionmaker(test_engine, expire_on_commit=False)

@pytest_asyncio.fixture(scope="session", autouse=True)
def reset_test_db():
    db_path = "prioritask.db"
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError as e:
            print(f"Error al eliminar la base de datos de prueba: {e}")

    async def init_models():
        async with test_engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    asyncio.run(init_models())
    yield
    asyncio.run(test_engine.dispose())

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest_asyncio.fixture(scope="function")
async def session():
    async with async_session() as session:
        yield session
        await session.close()

@pytest_asyncio.fixture
def auth_headers(session):
    # Crear un usuario de prueba con un UUID válido y un email único
    unique_email = f"test-{uuid4()}@example.com"
    user = Usuario(
        id=uuid4(),
        email=unique_email,
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    session.add(user)
    asyncio.run(session.commit())

    # Generar un token válido usando el JWT_SECRET_KEY de la configuración
    token = create_access_token(sub=str(user.id), secret=settings.JWT_SECRET_KEY)
    return {"Authorization": f"Bearer {token}"}
