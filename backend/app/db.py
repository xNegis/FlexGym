from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_config

_engine = create_engine(
    get_config().database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def check_database_connection(session: Session | None = None) -> None:
    if session is not None:
        session.execute(text("SELECT 1"))
    else:
        with SessionLocal() as s:
            s.execute(text("SELECT 1"))
