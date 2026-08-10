import os

os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from collections.abc import Callable, Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import reset_config
from app.db import get_session
from app.main import app
from app.models import Base


@pytest.fixture
def test_db_url(tmp_path: str) -> str:
    db_path = os.path.join(tmp_path, "test.db")
    return f"sqlite:///{db_path}"


@pytest.fixture
def test_engine(test_db_url: str) -> Generator[Engine, None, None]:
    engine = create_engine(test_db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def test_session_factory(
    test_engine: Engine,
) -> Generator[Callable[..., Session], None, None]:
    factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    yield factory


@pytest.fixture
def client(
    test_db_url: str, test_session_factory: Callable[..., Session]
) -> Generator[TestClient, None, None]:
    os.environ["DATABASE_URL"] = test_db_url
    reset_config()

    def override_get_session() -> Generator[Session, None, None]:
        session = test_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    reset_config()
