import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.db.session import get_db
from app.main import app
from app.models.base import Base
from app import models as models  # noqa: F401


def _create_test_engine():
    return create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def _override_get_db(test_session_local):
    def _get_db():
        db = test_session_local()
        try:
            yield db
        finally:
            db.close()

    return _get_db


def make_client():
    engine = _create_test_engine()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = _override_get_db(TestingSessionLocal)
    return TestClient(app)


def auth_headers(client: TestClient, email: str = "user@example.com", password: str = "testpass123"):
    register = client.post("/auth/register", json={"email": email, "password": password})
    if register.status_code not in (200, 201):
        raise AssertionError(f"Register failed: {register.status_code} {register.text}")
    login = client.post(
        "/auth/token",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if login.status_code != 200:
        raise AssertionError(f"Login failed: {login.status_code} {login.text}")
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client():
    with make_client() as test_client:
        yield test_client
