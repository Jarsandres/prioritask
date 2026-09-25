from uuid import uuid4

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.main import app
from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import Usuario
from app.services.auth import SECRET_KEY, create_access_token, hash_password

# ---------------------------------------------------------------------------
# Test engine: single in-memory SQLite shared across all connections
# ---------------------------------------------------------------------------
TEST_DB = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(
    TEST_DB,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


# ---------------------------------------------------------------------------
# Override get_session so the *app* uses the test engine too
# ---------------------------------------------------------------------------
async def override_get_session():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_session] = override_get_session


# ---------------------------------------------------------------------------
# Create all tables before every test, drop after
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function", autouse=True)
async def reset_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


# ---------------------------------------------------------------------------
# HTTP client wired to the ASGI app
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


# ---------------------------------------------------------------------------
# Raw SQLAlchemy session (for fixtures that write directly to the test DB)
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def session():
    async with TestSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Pre-created standard authenticated user (Backwards-compatibility fixture)
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def auth_headers(session):
    unique_email = f"test-{uuid4()}@example.com"
    user = Usuario(
        id=uuid4(),
        email=unique_email,
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    session.add(user)
    await session.commit()

    token = create_access_token(
        sub=str(user.id),
        secret=SECRET_KEY,
        is_superuser=False,
        role="USER",
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Security & Multi-Actor Fixtures (Milestone M-TEST / R4)
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def admin_user(session: AsyncSession) -> Usuario:
    """Creates a user with administrative privileges (is_superuser=True)."""
    user = Usuario(
        id=uuid4(),
        email=f"admin-{uuid4().hex[:8]}@example.com",
        nombre="Admin System",
        hashed_password=hash_password("adminSecret123"),
        is_active=True,
        is_superuser=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_headers(admin_user: Usuario) -> dict[str, str]:
    """Returns Bearer authorization headers for admin user."""
    token = create_access_token(
        sub=str(admin_user.id),
        secret=SECRET_KEY,
        is_superuser=True,
        role="ADMIN",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def user_a(session: AsyncSession) -> Usuario:
    """Standard User A (Room Owner / Task Creator)."""
    user = Usuario(
        id=uuid4(),
        email=f"usera-{uuid4().hex[:8]}@example.com",
        nombre="User Alpha",
        hashed_password=hash_password("alphaSecret123"),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_a_headers(user_a: Usuario) -> dict[str, str]:
    """Returns Bearer authorization headers for standard user A."""
    token = create_access_token(
        sub=str(user_a.id),
        secret=SECRET_KEY,
        is_superuser=False,
        role="USER",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def user_b(session: AsyncSession) -> Usuario:
    """Standard User B (Assigned Collaborator)."""
    user = Usuario(
        id=uuid4(),
        email=f"userb-{uuid4().hex[:8]}@example.com",
        nombre="User Bravo",
        hashed_password=hash_password("bravoSecret123"),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_b_headers(user_b: Usuario) -> dict[str, str]:
    """Returns Bearer authorization headers for standard user B."""
    token = create_access_token(
        sub=str(user_b.id),
        secret=SECRET_KEY,
        is_superuser=False,
        role="USER",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def user_c(session: AsyncSession) -> Usuario:
    """Standard User C (Unrelated Third Party / Non-Member)."""
    user = Usuario(
        id=uuid4(),
        email=f"userc-{uuid4().hex[:8]}@example.com",
        nombre="User Charlie",
        hashed_password=hash_password("charlieSecret123"),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_c_headers(user_c: Usuario) -> dict[str, str]:
    """Returns Bearer authorization headers for standard user C."""
    token = create_access_token(
        sub=str(user_c.id),
        secret=SECRET_KEY,
        is_superuser=False,
        role="USER",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def room_owner_a(session: AsyncSession, user_a: Usuario) -> Room:
    """Room owned by User A."""
    room = Room(nombre="Sala Principal A", owner_id=user_a.id)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest_asyncio.fixture
async def task_assigned_b(
    session: AsyncSession, user_a: Usuario, user_b: Usuario, room_owner_a: Room
) -> Task:
    """Task owned by User A, created in room_owner_a, assigned to User B."""
    task = Task(
        titulo="Tarea Colaborativa A-B",
        categoria=CategoriaTarea.MANTENIMIENTO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    assignment = TaskAssignment(
        task_id=task.id,
        user_id=user_b.id,
        asignado_por=user_a.id,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(task)
    return task
