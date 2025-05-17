import pytest
from sqlmodel import SQLModel, create_engine, Session
from app.models.user import Usuario

# Usamos SQLite en memoria para tests
TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(TEST_DB_URL, echo=False)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def test_create_usuario(session: Session):
    user = Usuario(email="test@ejemplo.com", hashed_password="hashed123")
    session.add(user)
    session.commit()
    session.refresh(user)

    assert user.id is not None
    assert user.email == "test@ejemplo.com"
    assert user.hashed_password == "hashed123"
    assert user.is_active is True
    assert user.is_superuser is False

def test_unique_email_constraint(session: Session):
    u1 = Usuario(email="dup@ejemplo.com", hashed_password="pw1")
    session.add(u1)
    session.commit()

    u2 = Usuario(email="dup@ejemplo.com", hashed_password="pw2")
    session.add(u2)
    with pytest.raises(Exception):
        session.commit()
